/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./views/**/*.ejs",
        "./public/**/*.js",
    ],
    theme: {
        extend: {
            fontFamily: {
                orbitron: ["'Orbitron'", "sans-serif"],
            },
            colors: {
                primary: '#0f172a',
                secondary: '#1e293b',
                accent: '#38bdf8',
                highlight: '#facc15'
            }
        },
    },
    plugins: [],
};