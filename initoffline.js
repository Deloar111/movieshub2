// initOffline.js - Initialize offline backup from existing data
import fs from 'fs';
import path from 'path';

// Get current working directory
const __dirname = path.resolve();

// Path to the offline backup file
const moviesBackupFile = path.join(__dirname, 'movies_backup.json');

// Your existing movies data
const existingMovies = [{
        "_id": "68723aff7370efe8d37ea7e6",
        "title": "Squid Game S03 (2025) (Hindi + English) Dual Audio Completed Web Series HEVC ESub",
        "description": "Squid Game: America Spinoff: A rumored spinoff series directed by David Fincher, which could feature Cate Blanchett in a role that bridges the original Korean series and the American version.",
        "cast": [
            "Lee Jung-jae",
            "Wi Ha-joon",
            "Lee Byung-hun",
            "Yim Si-wan",
            "Jo Yuri",
            "Park Sung-hoon",
            "Lee Da-wit"
        ],
        "genre": ["Web Series"],
        "movieLanguage": "Hindi + English",
        "quality": ["480p/720p/1080[HD]"],
        "poster": "https://i.ibb.co/842kLf4b/Squid-Game-season-3-poster.png",
        "screenshots": [
            "https://i.ibb.co/Lw7cHB4/Your-Image-Name.jpg"
        ],
        "qualityLinks": {
            "480p": "",
            "720p": "",
            "1080p": ""
        },
        "createdAt": "2025-07-12T10:37:51.698Z",
        "year": 2025,
        "views": 0,
        "downloads": 0
    },
    {
        "_id": "68729b0e18ddae312482dad9",
        "title": "Thug Life (2025) (Hindi + Tamil) Dual Audio UnCut South Movie HD ESub",
        "description": "In a world ruled by crime and betrayal, mafia kingpin Sakthivel and his brother Manikkam rescue a young boy, Amaran, during a violent police shootout and raise him as their own. Years later, when an assassination attempt shakes Sakthivel's empire, suspicion turns inward. Consumed by vengeance, Sakthivel sets out to destroy the very family he once built.",
        "cast": [
            "Kamal Haasan",
            "Silambarasan",
            "Trisha Krishnan",
            "Ashok Selvan",
            "Abhirami",
            "Nasaar",
            "Joju George",
            "Ali Fazal"
        ],
        "genre": ["Bollywood", "South Hindi Dubbed"],
        "movieLanguage": "Hindi + Tamil",
        "quality": ["480p/720p/1080[HD]"],
        "poster": "https://i.ibb.co/DPVSD7Kf/237413-thug.webp",
        "screenshots": [],
        "qualityLinks": {
            "480p": "",
            "720p": "",
            "1080p": ""
        },
        "createdAt": "2025-07-12T11:15:00.000Z",
        "year": 2025,
        "views": 0,
        "downloads": 0
    }
];

// Save the movie data to the backup file
function createOfflineBackup() {
    if (fs.existsSync(moviesBackupFile)) {
        console.log('✅ movies_backup.json already exists. Skipping initialization.');
        return;
    }

    fs.writeFileSync(moviesBackupFile, JSON.stringify(existingMovies, null, 2));
    console.log(`✅ Offline backup created at ${moviesBackupFile}`);
}

// Run the backup initializer
createOfflineBackup();