const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = 8000;
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log("Error connecting to database ", err);
  });

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

const userModel = require("./models/userModel");
const productModel = require("./models/productModel");
const exp = require("constants");
const orderModel = require("./models/orderModel");

//endpoint to register user

const sendVerificationEmail = async (email, verificationToken) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIl,
      pass: process.env.PASSWORD,
    },
  });

  const mailOptions = {
    from: "drop-store.me",
    to: email,
    subject: "Verify your email address",
    html: `<h1>Click the link below to verify your email address</h1> <a href="http://192.168.1.8:8000/verify/${verificationToken}">Verify Now</a>`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.log("Error sending verification email", err);
    res.status(500).json({ message: "Error sending verification email" });
  }
};

app.post("/register", async (req, res) => {
  try {
    const { name, email, password, profilePic } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Please provide your name." });
    }
    if (!email) {
      return res.status(400).json({ message: "Email is required!" });
    }
    if (!password) {
      return res.status(400).json({ message: "Please provide a password." });
    }

    const existingUser = await userModel.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    const newUser = new userModel({ name, email, password, profilePic });

    newUser.verificationToken = crypto.randomBytes(20).toString("hex");

    await newUser.save();

    sendVerificationEmail(newUser.email, newUser.verificationToken);
  } catch (err) {
    console.log("Error registering user.", err);
    res.status(500).json({ message: "Registration Failed." });
  }
});

//endpoint to verify email

app.get("/verify/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const user = await userModel.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: "Invalid verification token." });
    }

    user.verificationToken = undefined;
    user.verified = true;
    await user.save();
    res.status(200).json({ message: "Email verified successfully!" });
  } catch (err) {
    console.log("Error verifying email", err);
    res.status(500).json({ message: "Error verifying email." });
  }
});

//endpoint to login user

const generateSecretKey = () => {
  const secretKey = crypto.randomBytes(32).toString("hex");
  return secretKey;
};

const secretKey = generateSecretKey();

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });

    if (!user) {
      return res
        .status(401)
        .json({ message: "User not found. Please check your email address." });
    }

    if (user.role !== "admin") {
      return res
        .status(401)
        .json({ message: "You are not authorized to login." });
    }

    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    if (!user.verified) {
      return res.status(401).json({
        message: "Email not verified! Please verify your email first.",
      });
    }

    const token = jwt.sign({ userId: user?._id }, secretKey);

    res.status(200).json({ token });
  } catch (err) {
    console.log("Error logging in user", err);
    res.status(500).json({ message: "Error logging in user." });
  }
});

//endpoint to get user details

app.get("/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(user);
  } catch (err) {
    console.log("Error getting user details", err);
    res.status(500).json({ message: "Error getting user details." });
  }
});

//endpoint to get all users

app.get("/users/:userId", async (req, res) => {
  try {
    const loggedInUser = req.params.userId;
    await userModel.find({ _id: { $ne: loggedInUser } }).then((users) => {
      res.status(200).json(users);
    });
  } catch (err) {
    console.log("Error getting users", err);
    res.status(500).json({ message: "Error getting users." });
  }
});

//endpoint to upload products

app.post("/upload-product", async (req, res) => {
  try {
    const {
      productName,
      brandName,
      category,
      productImage,
      description,
      price,
    } = req.body;

    if (!productName) {
      return res.status(400).json({ message: "Please provide product name." });
    }
    if (!brandName) {
      return res.status(400).json({ message: "Please provide brand name." });
    }
    if (!category) {
      return res.status(400).json({ message: "Please provide category." });
    }
    if (!description) {
      return res.status(400).json({ message: "Please provide a description." });
    }
    if (!price) {
      return res.status(400).json({ message: "Please provide a price." });
    }
    if (!productImage) {
      return res
        .status(400)
        .json({ message: "Please upload at least one image." });
    }

    if (productImage.length < 3) {
      return res
        .status(400)
        .json({ message: "Please upload at least three images." });
    }

    const existingProduct = await productModel.findOne({ productName });

    if (existingProduct) {
      return res.status(400).json({ message: "Product already exists." });
    }

    const newProduct = new productModel({
      productName,
      brandName,
      category,
      productImage,
      description,
      price,
    });

    await newProduct.save();
    res.status(200).json({ message: "Product uploaded successfully!" });
  } catch (err) {
    console.log("Error uploading product", err);
    res.status(500).json({ message: "Error uploading product." });
  }
});

//endpoint to get all products

app.get("/all-products", async (req, res) => {
  try {
    const allProducts = await productModel.find().sort({ timeStamp: -1 });
    res.status(200).json(allProducts);
  } catch (err) {
    console.log("Error getting products", err);
    res.status(500).json({ message: "Error getting products." });
  }
});

//endpoint to edit product

app.post("/update-product", async (req, res) => {
  try {
    const { productId, productName, brandName, category, description, price } =
      req.body;

    if (!productName) {
      return res.status(400).json({ message: "Please provide product name." });
    }
    if (!brandName) {
      return res.status(400).json({ message: "Please provide brand name." });
    }
    if (!category) {
      return res.status(400).json({ message: "Please provide category." });
    }
    if (!description) {
      return res.status(400).json({ message: "Please provide a description." });
    }
    if (!price) {
      return res.status(400).json({ message: "Please provide a price." });
    }

    const updateProduct = await productModel.findByIdAndUpdate(
      productId,
      {
        productName,
        brandName,
        category,
        description,
        price,
      },
      { new: true }
    );

    if (!updateProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({
      message: "Product updated successfully!",
      data: updateProduct,
    });
  } catch (err) {
    console.log("Error updating product", err);
    res.status(500).json({ message: "Error updating product." });
  }
});

//endpoint to get all the orders

app.get("/all-orders", async (req, res) => {
  try {
    const allOrders = await orderModel.find().sort({ timeStamp: -1 });
    res.status(200).json(allOrders);
  } catch (err) {
    console.log("Error getting orders", err);
    res.status(500).json({ message: "Error getting orders." });
  }
});

//endpoint to mark order as delivered

app.post("/mark-delivered", async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await orderModel.findByIdAndUpdate(orderId, {
      delivered: true,
      deliveredAt: Date.now(),
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.status(200).json({ message: "Order delivered." });
  } catch (err) {
    console.log("Error marking order as delivered", err);
    res.status(500).json({ message: "Error marking order as delivered." });
  }
});

//endpoint to cancel order

app.post("/cancel-product", async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    const order = await orderModel.findOneAndUpdate(
      { _id: orderId, "products._id": productId },
      { $set: { "products.$.cancelled": true } },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order or product not found." });
    }

    res.status(200).json({ message: "Product cancelled successfully!", order });
  } catch (err) {
    console.log("Error cancelling product", err);
    res.status(500).json({ message: "Error cancelling product." });
  }
});
