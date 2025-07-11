import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    cast: [String],
    genre: [String],
    movieLanguage: String,
    quality: [String],
    poster: String,
    screenshots: [String],
    qualityLinks: {
        "480p": String,
        "720p": String,
        "1080p": String,
        "other": String
    },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Movie", movieSchema);