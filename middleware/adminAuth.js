// middleware/adminAuth.js// middleware/adminAuth.js
export default function adminAuth(req, res, next) {
    const adminSecret = process.env.ADMIN_SECRET;

    // Basic check using query or header for demonstration
    const isAdmin = req.query.admin === adminSecret;

    res.locals.isAdmin = isAdmin;
    next();
}