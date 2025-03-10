import cors from 'cors'
import express from "express";
import "dotenv/config";
import path from "path";

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PORT, PAYPAL_ENV} = process.env;

const base = PAYPAL_ENV === "live" 
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";    

const app = express(); 

console.log(base) 

// host static files
app.use(cors())
app.use(express.static("client"));

// parse post params sent in body in json format 
app.use(express.json());

/**
 * Generate an OAuth 2.0 access token for authenticating with PayPal REST APIs.
 * @see https://developer.paypal.com/api/rest/authentication/
 */
const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {   
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(
      PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET,
    ).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",   
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
  }
};

/**
 * Create an order to start the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create 
 */
const createOrder = async (cart) => {
  console.log("Creating PayPal Order with cart:", cart);

  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: cart[0].unit_amount.currency_code,
          value: cart[0].unit_amount.value,
        },
      },
    ],
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    body: JSON.stringify(payload), 
  });

  return handleResponse(response); 
};

/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "INSTRUMENT_DECLINED"}' 
      // "PayPal-Mock-Response": '{"mock_application_codes": "TRANSACTION_REFUSED"}' 
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}' 
    },
  });

  return handleResponse(response);   
};

async function handleResponse(response) { 
  console.log(response)
  try {
    const text = await response.text();
    const jsonResponse = text ? JSON.parse(text) : {};
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } catch (err) {
    throw new Error(`Error parsing response: ${err.message}`);
  }
}

app.post("/api/orders", async (req, res) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { cart } = req.body;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

// serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.resolve("./client/checkout.html"));
});

app.get('/test', (req, res) => {
  res.status(200).json({status: 'running'})
})

app.listen(PORT, () => {
  console.log(`Node server listening at http://localhost:${PORT}/`);
});
 