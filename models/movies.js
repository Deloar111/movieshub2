import mongoose from "mongoose";

class MovieValidationAlgorithms {
    static validateUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch {
            return false;
        }
    }

    static calculateContentScore(title, description, cast, genre) {
        let score = 0;
        if (title && title.length >= 2) score += Math.min(title.length * 2, 25);
        if (description && description.length >= 10) score += Math.min(description.length / 10, 30);
        if (cast && cast.length > 0) score += Math.min(cast.length * 5, 25);
        if (genre && genre.length > 0) score += Math.min(genre.length * 7, 20);
        return Math.round(score);
    }

    static generateSearchKeywords(title, cast, genre, description) {
        const keywords = new Set();
        if (title) title.toLowerCase().split(/\s+/).forEach(word => { if (word.length > 2) keywords.add(word); });
        if (cast && cast.length > 0) cast.forEach(actor => actor.toLowerCase().split(/\s+/).forEach(word => { if (word.length > 2) keywords.add(word); }));
        if (genre && genre.length > 0) genre.forEach(g => keywords.add(g.toLowerCase()));
        if (description) description.substring(0, 100).toLowerCase().split(/\s+/).forEach(word => { if (word.length > 3) keywords.add(word); });
        return Array.from(keywords);
    }
}

const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[\w\s():+\-–—.,'&/]+$/.test(v); // ✅ More flexible
            },
            message: 'Title contains invalid characters',
        },
    },


    description: {
        type: String,
        required: true,
        trim: true,
        minlength: 10,
        maxlength: 2000
    },
    cast: {
        type: [String],
        validate: {
            validator: function(cast) {
                return cast.every(actor =>
                    typeof actor === 'string' &&
                    actor.trim().length > 0 &&
                    actor.length <= 100 &&
                    /^[a-zA-Z0-9\s\-.'’]+$/.test(actor.trim())
                );
            },
            message: 'Invalid cast member name'
        }
    },


    genre: {
        type: [String],
        required: true,
        validate: {
            validator: genres => {
                const validGenres = ['Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Documentary', 'Animation', 'Fantasy', 'Crime', 'Mystery', 'War', 'Western', 'Musical', 'Biography', 'Family', 'Sport', 'History', 'Web Series', 'South Hindi Dubbed', 'Bollywood', 'Hollywood Hindi'];
                return genres.length > 0 && genres.every(g => validGenres.includes(g));
            },
            message: 'Invalid genre selection'
        }
    },
    movieLanguage: {
        type: String,
        required: true,
        enum: ['English', 'Hindi', 'Spanish', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Other']
    },
    qualityLinks: {
        type: Map,
        of: String,
        default: {}
    },

    poster: {
        type: String,
        required: true,
        validate: {
            validator: MovieValidationAlgorithms.validateUrl,
            message: 'Invalid poster URL'
        }
    },
    screenshots: {
        type: [String],
        required: true,
        validate: [{
                validator: array => array.length >= 3,
                message: 'Minimum 3 screenshots required'
            },
            {
                validator: array => array.every(url => MovieValidationAlgorithms.validateUrl(url)),
                message: 'All screenshots must be valid URLs'
            }
        ]
    },
    qualityLinks: {
        type: Map,
        of: {
            type: String,
            validate: {
                validator: url => !url || MovieValidationAlgorithms.validateUrl(url),
                message: 'Invalid quality download URL'
            }
        },
        default: {}
    },
    searchKeywords: {
        type: [String],
        index: true
    },
    contentScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    viewCount: {
        type: Number,
        default: 0,
        min: 0
    },
    downloadCount: {
        type: Number,
        default: 0,
        min: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 10
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

movieSchema.index({ genre: 1, movieLanguage: 1, isActive: 1 });
movieSchema.index({ title: 'text', description: 'text', cast: 'text', searchKeywords: 'text' });
movieSchema.index({ createdAt: -1 });
movieSchema.index({ viewCount: -1 });
movieSchema.index({ rating: -1 });

movieSchema.pre('save', async function(next) {
    try {
        this.updatedAt = new Date();
        this.searchKeywords = MovieValidationAlgorithms.generateSearchKeywords(this.title, this.cast, this.genre, this.description);
        this.contentScore = MovieValidationAlgorithms.calculateContentScore(this.title, this.description, this.cast, this.genre);
        next();
    } catch (error) {
        next(error);
    }
});

movieSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

movieSchema.methods.incrementViews = function() {
    this.viewCount += 1;
    return this.save();
};

movieSchema.methods.incrementDownloads = function() {
    this.downloadCount += 1;
    return this.save();
};

movieSchema.methods.updateRating = function(newRating) {
    this.rating = Math.max(0, Math.min(10, newRating));
    return this.save();
};

movieSchema.methods.getAvailableQualities = function() {
    const qualities = [];

    if (this.qualityLinks instanceof Map) {
        for (const [quality, url] of this.qualityLinks.entries()) {
            if (url && url.trim()) {
                qualities.push(quality);
            }
        }
    }

    return qualities;
};

movieSchema.statics.findByGenre = function(genre, limit = 10) {
    return this.find({ genre: { $in: [genre] }, isActive: true }).sort({ viewCount: -1 }).limit(limit);
};

movieSchema.statics.findPopular = function(limit = 10) {
    return this.find({ isActive: true }).sort({ viewCount: -1, rating: -1 }).limit(limit);
};

movieSchema.statics.findRecent = function(limit = 10) {
    return this.find({ isActive: true }).sort({ createdAt: -1 }).limit(limit);
};

movieSchema.statics.searchMovies = function(query, filters = {}) {
    const searchQuery = {
        $and: [
            { isActive: true },
            {
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } },
                    { cast: { $in: [new RegExp(query, 'i')] } },
                    { searchKeywords: { $in: [new RegExp(query, 'i')] } }
                ]
            }
        ]
    };

    if (filters.genre) searchQuery.$and.push({ genre: { $in: [filters.genre] } });
    if (filters.language) searchQuery.$and.push({ movieLanguage: filters.language });
    if (filters.quality) searchQuery.$and.push({ quality: { $in: [filters.quality] } });

    return this.find(searchQuery).sort({ contentScore: -1, viewCount: -1 }).limit(filters.limit || 20);
};

movieSchema.virtual('popularityScore').get(function() {
    const daysSinceCreation = Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
    const ageFactor = Math.max(0.1, 1 - (daysSinceCreation / 365));
    return Math.round((this.viewCount * 0.6 + this.downloadCount * 0.4) * ageFactor);
});

movieSchema.virtual('qualityCount').get(function() {
    return this.getAvailableQualities().length;
});

movieSchema.set('toJSON', { virtuals: true });
movieSchema.set('toObject', { virtuals: true });

export default mongoose.model("Movie", movieSchema);