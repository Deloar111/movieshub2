// utils/loadMovies.js

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Movie from '../models/movies.js';

const moviesBackupFile = path.join(process.cwd(), 'movies_backup.json');

export async function loadMovies() {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB connected. Loading movies from database...');
            const movies = await Movie.find().sort({ createdAt: -1 });
            return movies;
        } else {
            throw new Error('MongoDB not connected');
        }
    } catch (err) {
        console.warn('⚠️ Failed to load from MongoDB. Falling back to offline backup...');

        try {
            if (fs.existsSync(moviesBackupFile)) {
                const data = fs.readFileSync(moviesBackupFile, 'utf-8');
                const movies = JSON.parse(data);
                console.log(`📁 Loaded ${movies.length} movies from backup file`);
                return movies;
            } else {
                console.error('❌ movies_backup.json not found.');
                return [];
            }
        } catch (fileErr) {
            console.error('❌ Error reading backup file:', fileErr.message);
            return [];
        }
    }
}