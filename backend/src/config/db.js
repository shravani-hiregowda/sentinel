import mongoose from "mongoose";

export const getMongoConnectionOptions = () => ({
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || "50", 10),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || "5", 10),
  serverSelectionTimeoutMS: parseInt(
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "5000",
    10
  ),
  socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "45000", 10),
});

const connectDB = async (customUri) => {
  const uri = customUri || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sentinel";
  const options = getMongoConnectionOptions();
  try {
    const conn = await mongoose.connect(uri, options);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    if (uri.startsWith("mongodb+srv") && process.env.NODE_ENV !== "production") {
      console.warn("⚠️ Primary MONGO_URI failed, attempting fallback to local MongoDB (127.0.0.1:27017)...");
      try {
        const localConn = await mongoose.connect("mongodb://127.0.0.1:27017/sentinel");
        console.log(`✅ MongoDB Connected (Local Fallback): ${localConn.connection.host}`);
        return localConn;
      } catch {
        // Continue to log error
      }
    }
    console.error("❌ MongoDB connection failed");
    console.error(error.message);
    process.exit(1); // fail fast
  }
};

export default connectDB;
