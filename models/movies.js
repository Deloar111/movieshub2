import mongoose from "mongoose";

// ============================
// 🧠 ADVANCED VALIDATION ALGORITHMS
// ============================
class MovieValidationAlgorithms {
    // URL validation algorithm
    static validateUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch {
            return false;
        }
    }

    // Content quality scoring algorithm
    static calculateContentScore(title, description, cast, genre) {
        let score = 0;

        // Title quality (0-25 points)
        if (title && title.length >= 2) {
            score += Math.min(title.length * 2, 25);
        }

        // Description quality (0-30 points)
        if (description && description.length >= 10) {
            score += Math.min(description.length / 10, 30);
        }

        // Cast completeness (0-25 points)
        if (cast && cast.length > 0) {
            score += Math.min(cast.length * 5, 25);
        }

        // Genre completeness (0-20 points)
        if (genre && genre.length > 0) {
            score += Math.min(genre.length * 7, 20);
        }

        return Math.round(score);
    }

    // Duplicate detection algorithm
    static async checkDuplicates(title, cast, excludeId = null) {
        const query = {
            $or: [
                { title: { $regex: new RegExp(`^${title}$`, 'i') } },
                {
                    $and: [
                        { cast: { $in: cast } },
                        { cast: { $size: { $gte: cast.length / 2 } } }
                    ]
                }
            ]
        };

        if (excludeId) {
            query._id = { $ne: excludeId };
        }

        return await mongoose.model('Movie').findOne(query);
    }

    // Search keywords generation algorithm
    static generateSearchKeywords(title, cast, genre, description) {
        const keywords = new Set();

        // Add title words
        if (title) {
            title.toLowerCase().split(/\s+/).forEach(word => {
                if (word.length > 2) keywords.add(word);
            });
        }

        // Add cast names
        if (cast && cast.length > 0) {
            cast.forEach(actor => {
                actor.toLowerCase().split(/\s+/).forEach(word => {
                    if (word.length > 2) keywords.add(word);
                });
            });
        }

        // Add genres
        if (genre && genre.length > 0) {
            genre.forEach(g => keywords.add(g.toLowerCase()));
        }

        // Add description keywords (first 100 chars)
        if (description) {
            const shortDesc = description.substring(0, 100);
            shortDesc.toLowerCase().split(/\s+/).forEach(word => {
                if (word.length > 3) keywords.add(word);
            });
        }

        return Array.from(keywords);
    }
}

// ============================
// 🎬 ENHANCED MOVIE SCHEMA
// ============================
const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Movie title is required'],
        trim: true,
        minLength: [2, 'Title must be at least 2 characters long'],
        maxLength: [200, 'Title cannot exceed 200 characters'],
        validate: {
            validator: function(title) {
                return /^[a-zA-Z0-9\s\-\:\.\!\?]+$/.test(title);
            },
            message: 'Title contains invalid characters'
        }
    },

    description: {
        type: String,
        required: [true, 'Movie description is required'],
        trim: true,
        minLength: [10, 'Description must be at least 10 characters long'],
        maxLength: [2000, 'Description cannot exceed 2000 characters']
    },

    cast: {
        type: [String],
        validate: {
            validator: function(cast) {
                return cast.every(actor =>
                    actor.trim().length > 0 &&
                    actor.length <= 100 &&
                    /^[a-zA-Z\s\-\.]+$/.test(actor)
                );
            },
            message: 'Invalid cast member name'
        }
    },

    genre: {
        type: [String],
        required: [true, 'At least one genre is required'],
        validate: {
            validator: function(genres) {
                const validGenres = [
                    'Action', 'Adventure', 'Comedy', 'Drama', 'Horror',
                    'Romance', 'Sci-Fi', 'Thriller', 'Documentary', 'Animation',
                    'Fantasy', 'Crime', 'Mystery', 'War', 'Western', 'Musical',
                    'Biography', 'Family', 'Sport', 'History'
                ];
                return genres.length > 0 &&
                    genres.every(g => validGenres.includes(g));
            },
            message: 'Invalid genre selection'
        }
    },

    movieLanguage: {
        type: String,
        required: [true, 'Movie language is required'],
        enum: {
            values: ['English', 'Hindi', 'Spanish', 'French', 'German', 'Italian',
                'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Other'
            ],
            message: 'Invalid language selection'
        }
    },

    quality: {
        type: [String],
        required: [true, 'At least one quality option is required'],
        validate: {
            validator: function(qualities) {
                const validQualities = ['480p', '720p', '1080p', '4K', 'HDR'];
                return qualities.length > 0 &&
                    qualities.every(q => validQualities.includes(q));
            },
            message: 'Invalid quality selection'
        }
    },

    poster: {
        type: String,
        required: [true, 'Poster URL is required'],
        validate: {
            validator: MovieValidationAlgorithms.validateUrl,
            message: 'Invalid poster URL'
        }
    },

    screenshots: {
        type: [String],
        required: [true, 'Screenshots are required'],
        validate: [{
                validator: function(array) {
                    return array.length >= 3;
                },
                message: "Minimum 3 screenshots required"
            },
            {
                validator: function(array) {
                    return array.every(url => MovieValidationAlgorithms.validateUrl(url));
                },
                message: "All screenshots must be valid URLs"
            }
        ]
    },

    qualityLinks: {
        "480p": {
            type: String,
            validate: {
                validator: function(url) {
                    return !url || MovieValidationAlgorithms.validateUrl(url);
                },
                message: 'Invalid 480p download URL'
            }
        },
        "720p": {
            type: String,
            validate: {
                validator: function(url) {
                    return !url || MovieValidationAlgorithms.validateUrl(url);
                },
                message: 'Invalid 720p download URL'
            }
        },
        "1080p": {
            type: String,
            validate: {
                validator: function(url) {
                    return !url || MovieValidationAlgorithms.validateUrl(url);
                },
                message: 'Invalid 1080p download URL'
            }
        },
        "4K": {
            type: String,
            validate: {
                validator: function(url) {
                    return !url || MovieValidationAlgorithms.validateUrl(url);
                },
                message: 'Invalid 4K download URL'
            }
        },
        "other": {
            type: String,
            validate: {
                validator: function(url) {
                    return !url || MovieValidationAlgorithms.validateUrl(url);
                },
                message: 'Invalid other quality download URL'
            }
        }
    },

    // ============================
    // 🔍 SEARCH & ANALYTICS FIELDS
    // ============================
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
}, {
    timestamps: true
});

// ============================
// 🚀 PERFORMANCE INDEXES
// ============================
// Compound index for efficient filtering
movieSchema.index({
    genre: 1,
    movieLanguage: 1,
    isActive: 1
});

// Text index for full-text search
movieSchema.index({
    title: 'text',
    description: 'text',
    cast: 'text',
    searchKeywords: 'text'
});

// Sorting indexes
movieSchema.index({ createdAt: -1 });
movieSchema.index({ viewCount: -1 });
movieSchema.index({ rating: -1 });

// ============================
// 🔄 MIDDLEWARE ALGORITHMS
// ============================
// Pre-save middleware for data processing
movieSchema.pre('save', async function(next) {
    try {
        // Update timestamps
        this.updatedAt = new Date();

        // Generate search keywords
        this.searchKeywords = MovieValidationAlgorithms.generateSearchKeywords(
            this.title, this.cast, this.genre, this.description
        );

        // Calculate content score
        this.contentScore = MovieValidationAlgorithms.calculateContentScore(
            this.title, this.description, this.cast, this.genre
        );

        // Check for duplicates (only on new documents)
        if (this.isNew) {
            const duplicate = await MovieValidationAlgorithms.checkDuplicates(
                this.title, this.cast
            );
            if (duplicate) {
                throw new Error('A similar movie already exists');
            }
        }

        next();
    } catch (error) {
        next(error);
    }
});

// Pre-update middleware
movieSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

// ============================
// 🎯 INSTANCE METHODS
// ============================
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
    Object.entries(this.qualityLinks).forEach(([quality, url]) => {
        if (url && url.trim() !== '') {
            qualities.push(quality);
        }
    });
    return qualities;
};

// ============================
// 🔧 STATIC METHODS
// ============================
movieSchema.statics.findByGenre = function(genre, limit = 10) {
    return this.find({
            genre: { $in: [genre] },
            isActive: true
        })
        .sort({ viewCount: -1 })
        .limit(limit);
};

movieSchema.statics.findPopular = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ viewCount: -1, rating: -1 })
        .limit(limit);
};

movieSchema.statics.findRecent = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(limit);
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

    // Apply filters
    if (filters.genre) {
        searchQuery.$and.push({ genre: { $in: [filters.genre] } });
    }
    if (filters.language) {
        searchQuery.$and.push({ movieLanguage: filters.language });
    }
    if (filters.quality) {
        searchQuery.$and.push({ quality: { $in: [filters.quality] } });
    }

    return this.find(searchQuery)
        .sort({ contentScore: -1, viewCount: -1 })
        .limit(filters.limit || 20);
};

// ============================
// 🎬 VIRTUAL PROPERTIES
// ============================
movieSchema.virtual('popularityScore').get(function() {
    // Algorithm to calculate popularity based on views, downloads, and age
    const daysSinceCreation = Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
    const ageFactor = Math.max(0.1, 1 - (daysSinceCreation / 365)); // Newer movies get higher score

    return Math.round(
        (this.viewCount * 0.6 + this.downloadCount * 0.4) * ageFactor
    );
});

movieSchema.virtual('qualityCount').get(function() {
    return this.getAvailableQualities().length;
});

// Ensure virtual fields are serialized
movieSchema.set('toJSON', { virtuals: true });
movieSchema.set('toObject', { virtuals: true });

export default mongoose.model("Movie", movieSchema);