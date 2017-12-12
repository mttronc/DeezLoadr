/**
 * Made with love by J05HI [https://github.com/J05HI]
 * Released under the GPLv3.
 *
 * Feel free to contribute!
 */

const chalk = require('chalk');
const ora = require('ora');
const sanitize = require('sanitize-filename');
const Promise = require('bluebird');
const request = require('request-promise');
const nodeID3 = require('node-id3');
const crypto = require('crypto');
const md5File = require('md5-file');
const inquirer = require('inquirer');
const url = require('url');
const format = require('util').format;
const fs = require('fs-extra');
const https = require('https');
const nodePath = require('path');
const os = require('os');
const spawn = require('child_process').spawn;
const globby = require('globby');


const DOWNLOAD_DIR = 'DOWNLOADS/';

const musicQualities = {
    MP3_128: {
        id:   1,
        name: 'MP3 - 128 kbps'
    },
    MP3_256: {
        id:   5,
        name: 'MP3 - 256 kbps'
    },
    MP3_320: {
        id:   3,
        name: 'MP3 - 320 kbps'
    },
    FLAC:    {
        id:   9,
        name: 'FLAC - 1411 kbps'
    }
};

let selectedMusicQuality = musicQualities.MP3_320;
let downloadTaskRunning = false;
let askingForDownload = false;

const downloadSpinner = new ora({
    spinner: {
        interval: 400,
        frames:   [
            '♫',
            ' '
        ]
    },
    color:   'white'
});

const unofficialApiUrl = 'https://www.deezer.com/ajax/gw-light.php';
const tempPath = 'DeezLoadrTemp/';
const tempBinariesPath = tempPath + 'binaries/';
const tempAlbumCoversPath = tempPath + 'albumCovers/';

let unofficialApiQueries = {
    api_version: '1.0',
    api_token:   'null',
    input:       '3'
};

const httpHeaders = {
    'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36',
    'Content-Language': 'en-US',
    'Cache-Control':    'max-age=0',
    'Accept':           '*/*',
    'Accept-Charset':   'utf-8,ISO-8859-1;q=0.7,*;q=0.3',
    'Accept-Language':  'de-DE,de;q=0.8,en-US;q=0.6,en;q=0.4'
};


/**
 * Application init.
 */
(function initApp() {
    // Prevent closing the application instantly
    process.stdin.resume();
    
    /**
     * The handler which will be executed before closing the application.
     */
    function exitHandler() {
        fs.removeSync(tempPath);
        removeEmptyDirsRecursively(DOWNLOAD_DIR);
        
        process.exit();
    }
    
    // Do something when app is closing
    process.on('exit', exitHandler.bind(null, {}));
    
    // Catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {}));
    
    // Catches "kill pid"
    process.on('SIGUSR1', exitHandler.bind(null, {}));
    process.on('SIGUSR2', exitHandler.bind(null, {}));
    
    // Catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {}));
    
    
    // Ignore HTTPS certificate
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    
    // App info
    console.log(chalk.cyan('╔════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.yellow('              DeezLoadr v1.2.0              ') + chalk.cyan('║'));
    console.log(chalk.cyan('╠════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + '          Made with love by J05HI           ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '      Proudly released under the GPLv3      ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '     https://github.com/J05HI/DeezLoadr     ' + chalk.cyan('║'));
    console.log(chalk.cyan('╠════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + chalk.redBright(' ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ DONATE ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '      PayPal:  https://paypal.me/J05HI      ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '  BTC:  18JFjbdSDNQF69LNCJh8mhfoqRBTJuobCi  ' + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════╝\n'));
    
    
    unpackBinaries();
    
    downloadSpinner.text = 'Initiating Deezer API...';
    downloadSpinner.start();
    
    initDeezerApi().then(function () {
        downloadSpinner.succeed('Connected to Deezer API');
        
        // Renew the api key every 30 minutes
        setInterval(function () {
            initDeezerApi();
        }, 30 * 60 * 1000);
        
        selectMusicQuality();
    }).catch((err) => {
        downloadSpinner.fail(err);
    });
})();

/**
 * Removes all empty directories in the given directory.
 *
 * @param {String} directory
 */
function removeEmptyDirsRecursively(directory) {
    let isDir = fs.statSync(directory).isDirectory();
    
    if (!isDir) {
        return;
    }
    
    let files = fs.readdirSync(directory);
    
    if (0 < files.length) {
        files.forEach(function (file) {
            let fullPath = nodePath.join(directory, file);
            
            removeEmptyDirsRecursively(fullPath);
        });
        
        files = fs.readdirSync(directory);
    }
    
    if (0 === files.length) {
        fs.rmdirSync(directory);
    }
}

/**
 * Fetch and set the api token.
 */
function initDeezerApi() {
    return new Promise((resolve, reject) => {
        request.get({
            url:     'https://www.deezer.com/',
            headers: httpHeaders,
            jar:     true
        }).then((body) => {
            let regex = new RegExp(/checkForm\s*=\s*["|'](.*)["|']/g);
            let apiToken = regex.exec(body);
            
            if (Array.isArray(apiToken) && apiToken[1]) {
                unofficialApiQueries.api_token = apiToken[1];
                
                resolve();
            } else {
                throw 'Unable to initialize Deezer API.';
            }
        }).catch((err) => {
            if (404 === err.statusCode) {
                err = 'Could not connect to Deezer.';
            }
            
            reject(err);
        });
    });
}

/**
 * Show user selection for the music download quality.
 */
function selectMusicQuality() {
    console.log('');
    
    inquirer.prompt([
        {
            type:    'list',
            name:    'musicQuality',
            prefix:  '♫',
            message: 'Select music quality:',
            choices: [
                'MP3  - 128  kbps',
                'MP3  - 320  kbps',
                'FLAC - 1411 kbps'
            ],
            default: 1
        }
    ]).then(function (answers) {
        switch (answers.musicQuality) {
            case 'MP3  - 128  kbps':
                selectedMusicQuality = musicQualities.MP3_128;
                break;
            case 'MP3  - 320  kbps':
                selectedMusicQuality = musicQualities.MP3_320;
                break;
            case 'FLAC - 1411 kbps':
                selectedMusicQuality = musicQualities.FLAC;
                break;
        }
        
        askForNewDownload();
    });
}

/**
 * Ask for a album, playlist or track link to start the download.
 */
function askForNewDownload() {
    if (!downloadTaskRunning && !askingForDownload) {
        askingForDownload = true;
        
        console.log('\n');
        
        let questions = [
            {
                type:     'input',
                name:     'deezerUrl',
                prefix:   '♫',
                message:  'Deezer URL:',
                validate: function (deezerUrl) {
                    if (deezerUrl) {
                        let deezerUrlType = getDeezerUrlTye(deezerUrl);
                        let allowedDeezerUrlTypes = [
                            'album',
                            'playlist',
                            'track'
                        ];
                        
                        if (allowedDeezerUrlTypes.includes(deezerUrlType)) {
                            return true;
                        }
                    }
                    
                    return 'Deezer URL example: https://www.deezer.com/album|playlist|track/0123456789';
                }
            }
        ];
        
        inquirer.prompt(questions).then(answers => {
            askingForDownload = false;
            
            console.log('');
            
            let deezerUrlType = getDeezerUrlTye(answers.deezerUrl);
            let deezerUrlId = getDeezerUrlId(answers.deezerUrl);
            
            switch (deezerUrlType) {
                case 'album':
                    downloadMultiple('album', deezerUrlId);
                    break;
                case 'playlist':
                    downloadMultiple('playlist', deezerUrlId);
                    break;
                case 'track':
                    downloadSingleTrack(deezerUrlId);
                    break;
            }
        });
    }
}

/**
 * Get the deezer url type (album, playlist, track) from the deezer url.
 *
 * @param {String} deezerUrl
 *
 * @return {String}
 */
function getDeezerUrlTye(deezerUrl) {
    let urlQuery = url.parse(deezerUrl, true);
    urlQuery = urlQuery.pathname.split('/');
    
    return urlQuery[urlQuery.length - 2];
}

/**
 * Get the deezer url id from the deezer url.
 *
 * @param {String} deezerUrl
 *
 * @return {Number}
 */
function getDeezerUrlId(deezerUrl) {
    let urlQuery = url.parse(deezerUrl, true);
    urlQuery = urlQuery.pathname.split('/');
    
    let lastUrlPiece = urlQuery[urlQuery.length - 1];
    lastUrlPiece = lastUrlPiece.split('?');
    
    return parseInt(lastUrlPiece[0]);
}

/**
 * Download multiple mp3s (album or playlist)
 *
 * @param {String} type
 * @param {Number} id
 */
function downloadMultiple(type, id) {
    let url;
    
    downloadTaskRunning = true;
    
    if ('album' === type) {
        url = 'https://api.deezer.com/album/';
    } else if ('playlist' === type) {
        url = 'https://api.deezer.com/playlist/';
    }
    
    request(format(url + '%d?limit=-1', id)).then((data) => {
        const jsonData = JSON.parse(data);
        
        if (jsonData.error) {
            if ('playlist' === type && 'An active access token must be used to query information about the current user' === jsonData.error.message) {
                throw 'Private playlists are not supported!';
            } else {
                throw 'Could not fetch the given link!';
            }
        } else {
            Promise.mapSeries(jsonData.tracks.data, (track) => {
                return downloadSingleTrack(track.id);
            }, {
                concurrency: 1
            }).then(function () {
                downloadTaskRunning = false;
            });
        }
    }).catch(function (err) {
        downloadTaskRunning = false;
        
        downloadSpinner.fail(err);
        askForNewDownload();
    });
}

/**
 * Download a track + id3tags (album cover...) and save it in the downloads folder.
 *
 * @param {Number} id
 */
function downloadSingleTrack(id) {
    let dirPath;
    let saveFilePath;
    let fileExtension = 'mp3';
    
    return new Promise((resolve) => {
        return request.post({
            url:     unofficialApiUrl,
            headers: httpHeaders,
            qs:      unofficialApiQueries,
            body:    '[{"method":"song.getListData","params":{"sng_ids":[' + id + ']}}]',
            jar:     true
        }).then((body) => {
            if ('undefined' !== typeof JSON.parse(body)[0]) {
                let trackInfos = JSON.parse(body)[0].results.data[0];
                const trackQuality = getValidTrackQuality(trackInfos);
                
                return request('https://api.deezer.com/album/' + trackInfos.ALB_ID).then((albumData) => {
                    const albumJsonData = JSON.parse(albumData);
                    
                    trackInfos.ALB_ART_NAME = trackInfos.ART_NAME;
                    
                    if (albumJsonData.artist && albumJsonData.artist.name) {
                        trackInfos.ALB_ART_NAME = albumJsonData.artist.name;
                    }
                    
                    trackInfos.ALB_NUM_TRACKS = albumJsonData.nb_tracks;
                    trackInfos.GENRE = '';
                    
                    if (albumJsonData.genres && albumJsonData.genres.data[0] && albumJsonData.genres.data[0].name) {
                        trackInfos.GENRE = albumJsonData.genres.data[0].name;
                    }
                    
                    if (trackInfos.VERSION) {
                        trackInfos.SNG_TITLE += ' ' + trackInfos.VERSION;
                    }
                    
                    downloadSpinner.text = 'Downloading "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"';
                    downloadSpinner.start();
                    
                    if (trackQuality) {
                        if (trackQuality !== selectedMusicQuality) {
                            let selectedMusicQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === selectedMusicQuality)].name;
                            let trackQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === trackQuality)].name;
                            
                            downloadSpinner.warn('"' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '" not available in "' + selectedMusicQualityName + '". Using "' + trackQualityName + '".');
                        }
                        
                        const trackDownloadUrl = getTrackDownloadUrl(trackInfos, trackQuality.id);
                        
                        let artistName = multipleWhitespacesToSingle(sanitize(trackInfos.ALB_ART_NAME));
                        
                        if ('' === artistName.trim()) {
                            artistName = 'Unknown artist';
                        }
                        
                        let albumName = multipleWhitespacesToSingle(sanitize(trackInfos.ALB_TITLE));
                        
                        if ('' === albumName.trim()) {
                            albumName = 'Unknown album';
                        }
                        
                        dirPath = DOWNLOAD_DIR + '/' + artistName + '/' + albumName;
                        
                        fs.ensureDirSync(dirPath);
                        
                        if (musicQualities.FLAC.id === trackQuality.id) {
                            fileExtension = 'flac';
                        }
                        
                        saveFilePath = dirPath + '/' + multipleWhitespacesToSingle(sanitize(toTwoDigits(trackInfos.TRACK_NUMBER) + ' ' + trackInfos.SNG_TITLE)) + '.' + fileExtension;
                        
                        if (!fs.existsSync(saveFilePath)) {
                            return downloadTrack(trackInfos, trackDownloadUrl, saveFilePath).then(function () {
                                return trackInfos;
                            }).catch((error) => {
                                if ('wrongMd5' === error) {
                                    throw 'Song "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '": MD5 doesn\'t match Deezer\'s MD5.';
                                } else {
                                    let errorAppend = '';
                                    let error = new Error();
                                    
                                    if (trackInfos.FALLBACK && trackInfos.FALLBACK.SNG_ID) {
                                        downloadSingleTrack(trackInfos.FALLBACK.SNG_ID).then(() => {
                                            resolve();
                                        });
                                        
                                        if (trackInfos.FALLBACK.VERSION) {
                                            trackInfos.FALLBACK.SNG_TITLE += ' ' + trackInfos.FALLBACK.VERSION;
                                        }
                                        
                                        errorAppend = '\n  Using "' + trackInfos.FALLBACK.ART_NAME + ' - ' + trackInfos.FALLBACK.SNG_TITLE + '" as alternative.';
                                        error.name = 'notAvailableButAlternative';
                                    }
                                    
                                    error.message = 'Song "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '" not available for download.' + errorAppend;
                                    
                                    throw error;
                                }
                            });
                        } else {
                            let error = new Error();
                            error.name = 'songAlreadyExists';
                            error.message = 'Song "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '" already exists.';
                            
                            throw error;
                        }
                    } else {
                        throw 'Song "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '" not available for download.';
                    }
                });
            } else {
                throw 'Song "' + id + '" not found.';
            }
        }).then((trackInfos) => {
            downloadSpinner.succeed('Downloaded "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"');
            
            if ('mp3' === fileExtension || 'flac' === fileExtension) {
                addTrackTags(trackInfos, saveFilePath);
                
                resolve();
            } else {
                resolve();
                
                setTimeout(function () {
                    askForNewDownload();
                }, 50);
            }
        }).catch((err) => {
            if (404 === err.statusCode) {
                err = 'Song "' + id + '" not found.';
            }
            
            if (err.name && err.message) {
                if ('songAlreadyExists' === err.name) {
                    downloadSpinner.warn(err.message);
                } else {
                    downloadSpinner.fail(err.message);
                }
            } else {
                downloadSpinner.fail(err);
            }
            
            if ('notAvailableButAlternative' !== err.name) {
                resolve();
                
                setTimeout(function () {
                    askForNewDownload();
                }, 50);
            }
        });
    });
}

/**
 * Adds a zero to the beginning if the number has only one digit.
 *
 * @param {String} number
 * @returns {String}
 */
function toTwoDigits(number) {
    return (number < 10 ? '0' : '') + number;
}

/**
 * Replaces multiple whitespaces with a single one.
 *
 * @param {String} string
 * @returns {String}
 */
function multipleWhitespacesToSingle(string) {
    return string.replace(/[ _,]+/g, ' ');
}

/**
 * Calculate the URL to download the track.
 *
 * @param {Object} trackInfos
 * @param {Number} trackQuality
 *
 * @returns {String}
 */
function getTrackDownloadUrl(trackInfos, trackQuality) {
    const step1 = [trackInfos.MD5_ORIGIN, trackQuality, trackInfos.SNG_ID, trackInfos.MEDIA_VERSION].join('¤');
    
    let step2 = crypto.createHash('md5').update(step1, 'ascii').digest('hex') + '¤' + step1 + '¤';
    while (step2.length % 16 > 0) step2 += ' ';
    
    const step3 = crypto.createCipheriv('aes-128-ecb', 'jo6aey6haid2Teih', '').update(step2, 'ascii', 'hex');
    const cdn = generateRandomHexString(1);
    
    return 'https://e-cdns-proxy-' + cdn + '.dzcdn.net/mobile/1/' + step3;
}

/**
 * Generate a string with hex characters only.
 *
 * @param {Number} stringLength
 *
 * @returns {String}
 */
function generateRandomHexString(stringLength) {
    let randomString = '';
    let possible = '0123456789abcdef';
    
    for (let i = 0; i < stringLength; i++) {
        randomString += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    return randomString;
}

/**
 * Parse file size and check if it is defined & is non zero zero
 *
 * @returns {Boolean}
 */
function fileSizeIsDefined(filesize) {
    if ('undefined' === typeof filesize || 0 === parseInt(filesize)) {
        return false;
    }
    
    return true;
}

/**
 * Get a downloadable track quality.
 *
 * FLAC -> 320kbps -> 256kbps -> 128kbps
 * 320kbps -> 256kbps -> 128kbps -> FLAC
 * 128kbps -> 256kbps -> 320kbps -> FLAC
 *
 * @param {Object} trackInfos
 *
 * @returns {Object|Boolean}
 */
function getValidTrackQuality(trackInfos) {
    if (musicQualities.FLAC === selectedMusicQuality) {
        if (!fileSizeIsDefined(trackInfos.FILESIZE_FLAC)) {
            if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_320)) {
                if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_256)) {
                    if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_128)) {
                        return false;
                    }
                    
                    return musicQualities.MP3_128;
                }
                
                return musicQualities.MP3_256;
            }
            
            return musicQualities.MP3_320;
        }
        
        return musicQualities.FLAC;
    }
    
    if (musicQualities.MP3_320 === selectedMusicQuality) {
        if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_320)) {
            if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_256)) {
                if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_128)) {
                    if (!fileSizeIsDefined(trackInfos.FILESIZE_FLAC)) {
                        return false;
                    }
                    
                    return musicQualities.FLAC;
                }
                
                return musicQualities.MP3_128;
            }
            
            return musicQualities.MP3_256;
        }
        
        return musicQualities.MP3_320;
    }
    
    if (musicQualities.MP3_128 === selectedMusicQuality) {
        if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_128)) {
            if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_256)) {
                if (!fileSizeIsDefined(trackInfos.FILESIZE_MP3_320)) {
                    if (!fileSizeIsDefined(trackInfos.FILESIZE_FLAC)) {
                        return false;
                    }
                    
                    return musicQualities.FLAC;
                }
                
                return musicQualities.MP3_320;
            }
            
            return musicQualities.MP3_256;
        }
        
        return musicQualities.MP3_128;
    }
    
    return false;
}

/**
 * calculate the blowfish key to decrypt the track
 *
 * @param {Object} trackInfos
 */
function getBlowfishKey(trackInfos) {
    const SECRET = 'g4el58wc0zvf9na1';
    
    const idMd5 = crypto.createHash('md5').update(trackInfos.SNG_ID, 'ascii').digest('hex');
    let bfKey = '';
    
    for (let i = 0; i < 16; i++) {
        bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
    }
    
    return bfKey;
}

/**
 * Download the track, decrypt it and write it to a file.
 *
 * @param {Object} trackInfos
 * @param {String} trackDownloadUrl
 * @param {String} saveFilePath
 */
function downloadTrack(trackInfos, trackDownloadUrl, saveFilePath) {
    return new Promise((resolve, reject) => {
        https.get(trackDownloadUrl, function (response) {
            if (200 === response.statusCode) {
                const fileStream = fs.createWriteStream(saveFilePath);
                let i = 0;
                let percent = 0;
                
                response.on('readable', () => {
                    const bfKey = getBlowfishKey(trackInfos);
                    
                    let chunk;
                    while (chunk = response.read(2048)) {
                        if (100 * 2048 * i / response.headers['content-length'] >= percent + 1) {
                            percent++;
                        }
                        
                        if (i % 3 > 0 || chunk.length < 2048) {
                            fileStream.write(chunk);
                        } else {
                            const bfDecrypt = crypto.createDecipheriv('bf-cbc', bfKey, '\x00\x01\x02\x03\x04\x05\x06\x07');
                            bfDecrypt.setAutoPadding(false);
                            
                            let chunkDec = bfDecrypt.update(chunk.toString('hex'), 'hex', 'hex');
                            chunkDec += bfDecrypt.final('hex');
                            fileStream.write(chunkDec, 'hex');
                        }
                        i++;
                    }
                });
                
                response.on('end', () => {
                    fileStream.end();
                    
                    let saveFilePathExtension = nodePath.extname(saveFilePath);
                    
                    if ('.flac' === saveFilePathExtension) {
                        md5File(saveFilePath, (error, trackMd5) => {
                            if (error) {
                                throw error;
                            }
                            
                            if (trackInfos.MD5_ORIGIN !== trackMd5) {
                                reject('wrongMd5');
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            } else {
                reject();
            }
        });
    });
}

/**
 * Add ID3Tag to the mp3 file.
 *
 * @param {Object} trackInfos
 * @param {String} saveFilePath
 */
function addTrackTags(trackInfos, saveFilePath) {
    const albumCoverUrl = 'https://e-cdns-images.dzcdn.net/images/cover/' + trackInfos.ALB_PICTURE + '/1000x1000.jpg';
    
    try {
        fs.ensureDirSync(tempAlbumCoversPath);
        
        let albumCoverPath = tempAlbumCoversPath + multipleWhitespacesToSingle(sanitize(trackInfos.SNG_TITLE)) + '.jpg';
        let albumCoverFile = fs.createWriteStream(albumCoverPath);
        
        https.get(albumCoverUrl, function (albumCoverResponse) {
            if (200 === albumCoverResponse.statusCode) {
                let trackMp3Metadata = {
                    title:         trackInfos.SNG_TITLE,
                    album:         trackInfos.ALB_TITLE,
                    genre:         trackInfos.GENRE,
                    performerInfo: trackInfos.ALB_ART_NAME,
                    trackNumber:   trackInfos.TRACK_NUMBER + '/' + trackInfos.ALB_NUM_TRACKS,
                    partOfSet:     trackInfos.DISK_NUMBER,
                    ISRC:          trackInfos.ISRC,
                    encodedBy:     'DeezLoadr',
                    comment:       {
                        text: 'Downloaded from Deezer with DeezLoadr. https://github.com/J05HI/DeezLoadr'
                    },
                    image:         (albumCoverPath).replace(/\\/g, '/')
                };
                
                trackMp3Metadata.copyright = '';
                
                if (trackInfos.COPYRIGHT) {
                    trackMp3Metadata.copyright = trackInfos.COPYRIGHT;
                }
                
                if (trackInfos.PHYSICAL_RELEASE_DATE) {
                    trackMp3Metadata.year = trackInfos.PHYSICAL_RELEASE_DATE.slice(0, 4);
                }
                
                let trackArtists = [];
                
                trackInfos.ARTISTS.forEach(function (trackArtist) {
                    if (trackArtist.ART_NAME) {
                        trackArtist = trackArtist.ART_NAME.split(new RegExp(' and | & ', 'g'));
                        trackArtist = trackArtist.map(Function.prototype.call, String.prototype.trim);
                        
                        trackArtists = trackArtists.concat(trackArtist);
                    }
                });
                
                trackArtists = [...new Set(trackArtists)];
                trackMp3Metadata.artist = trackArtists.join(', ');
                
                
                if (trackInfos.SNG_CONTRIBUTORS) {
                    if (trackInfos.SNG_CONTRIBUTORS.composer) {
                        trackMp3Metadata.composer = trackInfos.SNG_CONTRIBUTORS.composer.join(', ');
                    }
                    if (trackInfos.SNG_CONTRIBUTORS.musicpublisher) {
                        trackMp3Metadata.publisher = trackInfos.SNG_CONTRIBUTORS.musicpublisher.join(', ');
                    }
                }
                
                albumCoverResponse.pipe(albumCoverFile);
                
                albumCoverResponse.on('end', () => {
                    setTimeout(function () {
                        let saveFilePathExtension = nodePath.extname(saveFilePath);
                        
                        if ('.mp3' === saveFilePathExtension) {
                            if (!nodeID3.write(trackMp3Metadata, saveFilePath)) {
                                throw 'Tag write error.';
                            } else {
                                askForNewDownload();
                            }
                            
                        } else if ('.flac' === saveFilePathExtension) {
                            let metaflacInstance = spawn(tempBinariesPath + 'metaflac', [
                                '--remove-all-tags',
                                '--set-tag=TITLE=' + trackMp3Metadata.title,
                                '--set-tag=ALBUM=' + trackMp3Metadata.album,
                                '--set-tag=GENRE=' + trackMp3Metadata.genre,
                                '--set-tag=COPYRIGHT=' + trackMp3Metadata.copyright,
                                '--set-tag=PERFORMER=' + trackMp3Metadata.performerInfo,
                                '--set-tag=ALBUMARTIST=' + trackMp3Metadata.performerInfo,
                                '--set-tag=ARTIST=' + trackMp3Metadata.artist,
                                '--set-tag=TRACKNUMBER=' + trackMp3Metadata.trackNumber,
                                '--set-tag=DISCNUMBER=' + trackMp3Metadata.partOfSet,
                                '--set-tag=ISRC=' + trackMp3Metadata.ISRC,
                                '--set-tag=DATE=' + trackMp3Metadata.year,
                                '--set-tag=ENCODER=' + trackMp3Metadata.encodedBy,
                                '--set-tag=COMMENT=' + trackMp3Metadata.comment.text,
                                '--set-tag=CONTACT=' + 'https://github.com/J05HI/DeezLoadr',
                                '--import-picture-from=' + trackMp3Metadata.image,
                                saveFilePath
                            ]);
                            
                            metaflacInstance.on('exit', function (code) {
                                if (code !== 0) {
                                    throw 'Tag write error.';
                                } else {
                                    let flacInstance = spawn(tempBinariesPath + 'flac', [
                                        '--best',
                                        '--force',
                                        saveFilePath
                                    ]);
                                    
                                    flacInstance.on('exit', function (code) {
                                        if (code !== 0) {
                                            throw 'Re encode error.';
                                        } else {
                                            askForNewDownload();
                                        }
                                    });
                                }
                            });
                        }
                    }, 50);
                });
            } else {
                throw 'Could not download album cover.';
            }
        });
    } catch (ex) {
        downloadSpinner.warn('Failed writing ID3 tags to "' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"');
        
        askForNewDownload();
    }
}

/**
 * Get the path where the binaries for the current OS are located.
 *
 * @returns {string}
 */
function getBinariesPath() {
    const platform = os.platform();
    const arch = os.arch();
    
    return nodePath.join(
        __dirname,
        'binaries',
        platform,
        arch,
        '/'
    );
}

/**
 * Unpack the binaries to "DeezLoadrTemp/binaries".
 */
function unpackBinaries() {
    (async () => {
        const binariesPaths = await globby([getBinariesPath() + '**/*']);
        fs.ensureDirSync(tempBinariesPath);
        
        binariesPaths.forEach(function (binaryPath) {
            fs.readFile(binaryPath, function read(err, data) {
                if (err) {
                    console.log(err);
                } else {
                    const binaryName = nodePath.basename(binaryPath);
                    
                    fs.writeFile(tempBinariesPath + binaryName, data, 'binary', function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            fs.chmodSync(tempBinariesPath + binaryName, '755');
                        }
                    });
                }
            });
        });
    })();
}