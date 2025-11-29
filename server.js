const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Performance & Security Middleware
app.use(compression()); // Enable gzip compression
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static files with aggressive caching
app.use(express.static(__dirname, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Cache HTML files for shorter time
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
        }
        // Cache assets aggressively
        else if (path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|webp)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        }
    }
}));

// Progress tracking
const downloadProgress = new Map();

// Create downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Redirect old URL to new home page
app.get('/instagram-reel-downloader.html', (req, res) => {
    res.redirect(301, '/');
});

// Instagram reel downloader endpoint
app.post('/api/download-reel', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid Instagram URL is required' 
            });
        }

        const postId = extractPostId(url);
        if (!postId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid Instagram URL format' 
            });
        }

        const progressId = crypto.randomBytes(16).toString('hex');
        downloadProgress.set(progressId, { 
            status: 'starting', 
            progress: 0, 
            message: 'Initializing download...' 
        });
        
        res.json({ 
            success: true, 
            progressId: progressId,
            message: 'Download started' 
        });
        
        // Process download asynchronously
        processDownload(url, progressId).catch(error => {
            downloadProgress.set(progressId, {
                status: 'error',
                progress: 100,
                message: 'Download failed',
                error: error.message
            });
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Server error occurred' 
        });
    }
});

// Process download with fallback methods
async function processDownload(url, progressId) {
    try {
        downloadProgress.set(progressId, { 
            status: 'downloading', 
            progress: 10, 
            message: 'Processing request...' 
        });
        
        // Try yt-dlp first (most reliable)
        try {
            const videoData = await downloadViaYtDlp(url, progressId);
            if (videoData) {
                downloadProgress.set(progressId, { 
                    status: 'completed', 
                    progress: 100, 
                    message: 'Download completed!',
                    data: videoData
                });
                return;
            }
        } catch (error) {
            // Continue to next method
        }

        // Try Instaloader fallback
        try {
            downloadProgress.set(progressId, { 
                status: 'downloading', 
                progress: 50, 
                message: 'Trying alternative method...' 
            });
            
            const videoData = await downloadViaInstaloader(url, progressId);
            if (videoData) {
                downloadProgress.set(progressId, { 
                    status: 'completed', 
                    progress: 100, 
                    message: 'Download completed!',
                    data: videoData
                });
                return;
            }
        } catch (error) {
            // Continue to alternatives
        }

        // All methods failed
        downloadProgress.set(progressId, {
            status: 'failed',
            progress: 100,
            message: 'Direct download failed',
            alternatives: [
                {
                    name: 'SaveInsta',
                    url: `https://saveinsta.app/download?url=${encodeURIComponent(url)}`,
                    description: 'Professional Instagram downloader'
                },
                {
                    name: 'SnapInsta', 
                    url: `https://snapinsta.app/?url=${encodeURIComponent(url)}`,
                    description: 'Fast and reliable downloads'
                }
            ]
        });

    } catch (error) {
        downloadProgress.set(progressId, {
            status: 'error',
            progress: 100,
            message: 'Processing error occurred',
            error: error.message
        });
    }
}

// yt-dlp download method
async function downloadViaYtDlp(url, progressId) {
    return new Promise((resolve, reject) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const outputDir = path.join(downloadsDir, `ytdlp_${uniqueId}`);
        
        fs.mkdirSync(outputDir, { recursive: true });
        
        const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');
        const args = [
            url,
            '--output', outputTemplate,
            '--write-thumbnail',
            '--write-info-json',
            '--format', 'best[ext=mp4]',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--referer', 'https://www.instagram.com/',
            '--no-warnings'
        ];
        
        const process = spawn('yt-dlp', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 45000
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
            output += data.toString();
            updateProgress(progressId, output);
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = processYtdlpOutput(outputDir);
                    if (result) {
                        scheduleCleanup(outputDir);
                        resolve(result);
                    } else {
                        reject(new Error('No video file found'));
                    }
                } catch (error) {
                    reject(new Error('Processing failed'));
                }
            } else {
                reject(new Error('Download failed'));
            }
        });
        
        process.on('error', () => {
            reject(new Error('yt-dlp not available'));
        });
    });
}

// Instaloader download method
async function downloadViaInstaloader(url, progressId) {
    return new Promise((resolve, reject) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const outputDir = path.join(downloadsDir, `instaloader_${uniqueId}`);
        
        fs.mkdirSync(outputDir, { recursive: true });
        
        const pythonScript = `
import instaloader
import sys
import json
import os

try:
    L = instaloader.Instaloader(
        dirname_pattern='${outputDir}',
        filename_pattern='{shortcode}',
        download_comments=False,
        download_geotags=False,
        download_stories=False,
        download_highlights=False,
        save_metadata=False
    )
    
    shortcode = '${url}'.split('/')[-2] if '${url}'.endswith('/') else '${url}'.split('/')[-1]
    if '?' in shortcode:
        shortcode = shortcode.split('?')[0]
    
    post = instaloader.Post.from_shortcode(L.context, shortcode)
    L.download_post(post, target='${outputDir}')
    
    files = os.listdir('${outputDir}')
    video_file = next((f for f in files if f.endswith('.mp4')), None)
    
    if video_file:
        result = {
            "success": True,
            "video_path": os.path.join('${outputDir}', video_file),
            "title": post.caption[:100] if post.caption else "Instagram Reel",
            "uploader": post.owner_username
        }
        print(json.dumps(result))
    else:
        print(json.dumps({"success": False, "error": "No video found"}))
        
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
        
        const process = spawn('python', ['-c', pythonScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        process.on('close', (code) => {
            try {
                const lines = output.trim().split('\n');
                const resultLine = lines[lines.length - 1];
                const result = JSON.parse(resultLine);
                
                if (result.success && result.video_path) {
                    scheduleCleanup(outputDir);
                    resolve({
                        video_url: `/download/${path.basename(result.video_path)}?dir=${path.basename(outputDir)}`,
                        title: result.title,
                        uploader: result.uploader,
                        quality: 'HD'
                    });
                } else {
                    reject(new Error(result.error || 'Instaloader failed'));
                }
            } catch (error) {
                reject(new Error('Failed to parse result'));
            }
        });
        
        process.on('error', () => {
            reject(new Error('Instaloader not available'));
        });
    });
}

// Process yt-dlp output
function processYtdlpOutput(outputDir) {
    try {
        const files = fs.readdirSync(outputDir);
        const videoFile = files.find(f => f.endsWith('.mp4'));
        const thumbnailFile = files.find(f => f.endsWith('.jpg') || f.endsWith('.webp'));
        const infoFile = files.find(f => f.endsWith('.info.json'));
        
        if (!videoFile) return null;
        
        const videoPath = path.join(outputDir, videoFile);
        const videoStats = fs.statSync(videoPath);
        
        if (videoStats.size === 0) return null;
        
        let metadata = {};
        if (infoFile) {
            try {
                const infoData = fs.readFileSync(path.join(outputDir, infoFile), 'utf8');
                metadata = JSON.parse(infoData);
            } catch (error) {
                // Ignore metadata errors
            }
        }
        
        return {
            video_url: `/download/${encodeURIComponent(videoFile)}?dir=${encodeURIComponent(path.basename(outputDir))}`,
            thumbnail_url: thumbnailFile ? `/download/${encodeURIComponent(thumbnailFile)}?dir=${encodeURIComponent(path.basename(outputDir))}` : null,
            title: metadata.title || metadata.description || 'Instagram Reel',
            uploader: metadata.uploader || metadata.channel || 'Unknown',
            duration: metadata.duration,
            quality: metadata.height ? `${metadata.height}p` : 'HD',
            fileSize: Math.round(videoStats.size / 1024 / 1024 * 100) / 100 + ' MB'
        };
    } catch (error) {
        return null;
    }
}

// Update progress from yt-dlp output
function updateProgress(progressId, output) {
    if (!downloadProgress.has(progressId)) return;
    
    const lines = output.split('\n');
    for (const line of lines) {
        if (line.includes('[download]') && line.includes('%')) {
            const match = line.match(/(\d+(?:\.\d+)?)%/);
            if (match) {
                const percent = Math.min(95, parseInt(match[1]));
                downloadProgress.set(progressId, { 
                    status: 'downloading', 
                    progress: Math.max(20, percent), 
                    message: `Downloading... ${percent}%` 
                });
            }
        }
    }
}

// Schedule cleanup after 1 hour
function scheduleCleanup(directory) {
    setTimeout(() => {
        try {
            if (fs.existsSync(directory)) {
                fs.rmSync(directory, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }, 3600000);
}

// Extract post ID from URL
function extractPostId(url) {
    const patterns = [
        /\/p\/([A-Za-z0-9_-]+)/,
        /\/reel\/([A-Za-z0-9_-]+)/,
        /\/reels\/([A-Za-z0-9_-]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

// Download endpoint
app.get('/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const dir = req.query.dir;
        const download = req.query.download === 'true';
        
        if (!dir || !filename) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        
        const filePath = path.join(downloadsDir, dir, filename);
        
        // Security check
        if (!path.normalize(filePath).startsWith(path.normalize(downloadsDir))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const stats = fs.statSync(filePath);
        const ext = path.extname(filename).toLowerCase();
        
        // Set headers
        const contentTypes = {
            '.mp4': 'video/mp4',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp'
        };
        
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        if (download) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } else {
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        }
        
        // Handle range requests for video streaming
        const range = req.headers.range;
        if (range && ext === '.mp4') {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
            res.setHeader('Content-Length', chunksize);
            
            const fileStream = fs.createReadStream(filePath, { start, end });
            fileStream.pipe(res);
        } else {
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
        
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// Progress endpoint
app.get('/api/progress/:id', (req, res) => {
    const progress = downloadProgress.get(req.params.id) || { status: 'not_found', progress: 0 };
    res.json(progress);
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access at: http://localhost:${PORT}`);
});

module.exports = app;