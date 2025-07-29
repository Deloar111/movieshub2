import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        validate: {
            validator: function(value) {
                return /^[\w\s\-()|+.:,'"&/\\[\]{}!?]+$/.test(value);
            },
            message: "Title contains invalid characters"
        }
    },

    year: {
        type: Number
    },

    views: {
        type: Number,
        default: 0
    },

    downloads: {
        type: Number,
        default: 0
    },

    description: {
        type: String
    },

    cast: {
        type: [String],
        default: [],
        validate: {
            validator: function(castArray) {
                return castArray.every(name =>
                    /^[\w\s.'\-éÉáÁíÍóÓúÚàÀèÈäÄëËöÖüÜçÇñÑ,&()]+$/.test(name)
                );
            },
            message: "Invalid cast member name"
        }
    },

    genre: {
        type: [String],
        default: []
    },

    movieLanguage: {
        type: String
    },

    quality: {
        type: [String],
        default: []
    },

    poster: {
        type: String
    },

    screenshots: {
        type: [String],
        default: []
    },

    qualityLinks: {
        type: Map,
        of: String,
        default: {}
        // Example keys: "480p", "720p", "1080p", "4K", "HDR"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Movie = mongoose.model("Movie", movieSchema);
export default Movie;