// utils/loadMovies.js - Enhanced version
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Movie from '../models/movies.js';

const moviesBackupFile = path.join(process.cwd(), 'movies_backup.json');

// Create backup when MongoDB is available
export async function createBackup() {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('📝 Creating backup from MongoDB...');
            const movies = await Movie.find().sort({ createdAt: -1 });

            fs.writeFileSync(moviesBackupFile, JSON.stringify(movies, null, 2));
            console.log(`✅ Backup created with ${movies.length} movies`);
            return true;
        }
        return false;
    } catch (err) {
        console.error('❌ Failed to create backup:', err.message);
        return false;
    }
}

// Load movies with automatic backup creation
export async function loadMovies(forceBackup = false) {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB connected. Loading movies from database...');
            const movies = await Movie.find().sort({ createdAt: -1 });

            // Auto-create backup if it doesn't exist or is old
            if (forceBackup || shouldUpdateBackup()) {
                await createBackup();
            }

            return movies;
        } else {
            throw new Error('MongoDB not connected');
        }
    } catch (err) {
        console.warn('⚠️ Failed to load from MongoDB. Falling back to offline backup...');
        return loadFromBackup();
    }
}

// Load from backup file
export async function loadFromBackup() {
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

// Check if backup needs updating (older than 24 hours)
function shouldUpdateBackup() {
    try {
        if (!fs.existsSync(moviesBackupFile)) return true;

        const stats = fs.statSync(moviesBackupFile);
        const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

        return ageInHours > 24; // Update if older than 24 hours
    } catch (err) {
        return true;
    }
}

// Get backup status
export function getBackupStatus() {
    try {
        if (!fs.existsSync(moviesBackupFile)) {
            return { exists: false, message: 'No backup file found' };
        }

        const stats = fs.statSync(moviesBackupFile);
        const data = JSON.parse(fs.readFileSync(moviesBackupFile, 'utf-8'));

        return {
            exists: true,
            count: data.length,
            lastUpdated: stats.mtime,
            size: (stats.size / 1024 / 1024).toFixed(2) + ' MB'
        };
    } catch (err) {
        return { exists: false, error: err.message };
    }
}