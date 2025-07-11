// middleware/adminAuth.js
export default function adminAuth(req, res, next) {
    // Always set isAdmin to true for now (you are the admin)
    res.locals.isAdmin = true; // This makes isAdmin available in EJS
    next();
}