// middleware/adminAuth.js
export default function adminAuth(req, res, next) {
    res.locals.isAdmin = true;
    next();
}