import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    cast: [String],
    genre: [String],
    movieLanguage: String,
    quality: [String],
    poster: String,

    // ✅ Correct validation for at least 3 screenshots
    screenshots: {
        type: [String],
        validate: {
            validator: function(array) {
                return array.length >= 3;
            },
            message: "Minimum 3 screenshots required",
        },
    },

    // ✅ Fix: add comma above and validate object here
    qualityLinks: {
        "480p": String,
        "720p": String,
        "1080p": String,
        "other": String,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model("Movie", movieSchema);