// middleware/adminAuth.js
export default function adminAuth(req, res, next) {
    const adminSecret = process.env.ADMIN_SECRET || "8892";
    const querySecret = req.query.admin;

    res.locals.isAdmin = querySecret === adminSecret;
    next();
}