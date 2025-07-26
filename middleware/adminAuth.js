// middleware/adminAuth.js - SIMPLIFIED AND FIXED VERSION
export default function adminAuth(req, res, next) {
    try {
        // Check if admin query parameter is present and correct
        const isAdmin = req.query.admin === "8892";

        // Set admin status in response locals
        res.locals.isAdmin = isAdmin;

        // Log admin status for debugging
        if (isAdmin) {
            console.log("👨‍💼 Admin access granted");
        }

        next();
    } catch (error) {
        console.error("❌ AdminAuth middleware error:", error);
        res.locals.isAdmin = false;
        next();
    }
}