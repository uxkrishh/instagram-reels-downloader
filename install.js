const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Instagram Reel Downloader - Setup');
console.log('=====================================\n');

async function checkPython() {
    return new Promise((resolve) => {
        const pythonProcess = spawn('python', ['--version'], { stdio: 'pipe' });
        
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Python is available');
                resolve(true);
            } else {
                const python3Process = spawn('python3', ['--version'], { stdio: 'pipe' });
                python3Process.on('close', (code3) => {
                    if (code3 === 0) {
                        console.log('✅ Python3 is available');
                        resolve(true);
                    } else {
                        console.log('❌ Python not found');
                        resolve(false);
                    }
                });
            }
        });
        
        pythonProcess.on('error', () => {
            const python3Process = spawn('python3', ['--version'], { stdio: 'pipe' });
            python3Process.on('close', (code3) => {
                if (code3 === 0) {
                    console.log('✅ Python3 is available');
                    resolve(true);
                } else {
                    console.log('❌ Python not found');
                    resolve(false);
                }
            });
            python3Process.on('error', () => resolve(false));
        });
    });
}

async function installPythonDeps() {
    return new Promise((resolve) => {
        console.log('📦 Installing Python dependencies...');
        
        const pipProcess = spawn('pip', ['install', '-r', 'requirements.txt'], { 
            stdio: 'inherit' 
        });
        
        pipProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Dependencies installed');
                resolve(true);
            } else {
                const pip3Process = spawn('pip3', ['install', '-r', 'requirements.txt'], { 
                    stdio: 'inherit' 
                });
                
                pip3Process.on('close', (code3) => {
                    if (code3 === 0) {
                        console.log('✅ Dependencies installed');
                        resolve(true);
                    } else {
                        console.log('❌ Failed to install dependencies');
                        resolve(false);
                    }
                });
                pip3Process.on('error', () => resolve(false));
            }
        });
        pipProcess.on('error', () => {
            const pip3Process = spawn('pip3', ['install', '-r', 'requirements.txt'], { 
                stdio: 'inherit' 
            });
            
            pip3Process.on('close', (code3) => {
                if (code3 === 0) {
                    console.log('✅ Dependencies installed');
                    resolve(true);
                } else {
                    console.log('❌ Failed to install dependencies');
                    resolve(false);
                }
            });
            pip3Process.on('error', () => resolve(false));
        });
    });
}

function createDownloadsDir() {
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log('✅ Created downloads directory');
    } else {
        console.log('✅ Downloads directory exists');
    }
}

async function setup() {
    try {
        console.log('🔍 Checking requirements...\n');
        
        const pythonOk = await checkPython();
        if (!pythonOk) {
            console.log('\n❌ Setup failed: Python not found');
            console.log('\n🔧 Manual steps:');
            console.log('1. Install Python 3.7+ from https://python.org');
            console.log('2. Run: pip install -r requirements.txt');
            console.log('3. Run: npm start');
            process.exit(1);
        }
        
        const depsOk = await installPythonDeps();
        if (!depsOk) {
            console.log('\n❌ Setup failed: Could not install Python dependencies');
            console.log('\nTry manually: pip install -r requirements.txt');
            process.exit(1);
        }
        
        createDownloadsDir();
        
        console.log('\n🎉 Setup completed!');
        console.log('\n📋 Next steps:');
        console.log('1. Run: npm start');
        console.log('2. Open: http://localhost:3000');
        
    } catch (error) {
        console.log('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

setup();