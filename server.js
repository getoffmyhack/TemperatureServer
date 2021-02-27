#!/opt/local/bin/node

const udpServer     = require('./udpServer.js');
const httpServer    = require('./httpServer.js');
var   sqlite3       = require('sqlite3').verbose()

var myArgs = process.argv.slice(2);

if( (myArgs.length == 1) && (myArgs[0] == 'production') ){
    global.DEVMODE = 0;
    console.log("Starting production server");
} else {
    global.DEVMODE = 1;
    console.log("Starting development server");
}


var udpPort;
var httpPort;
var dbFile;


if(global.DEVMODE == 0) {
    dbFile      = process.env.TS_DB_FILE                || "./db/master.db";
    udpPort     = parseInt(process.env.TS_UDP_PORT)     || 57005;
    httpPort    = parseInt(process.env.TS_HTTP_PORT)    || 8080;
} else {
    dbFile      = process.env.TS_DB_FILE                || "./db/development.db";
    udpPort     = parseInt(process.env.TS_UDP_PORT)     || 12345;
    httpPort    = parseInt(process.env.TS_HTTP_PORT)    || 8081;
}


let db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Connected to database: %s', dbFile);
});

// start UDP server
udpServer.start(udpPort, db);

// start http server
httpServer.start(httpPort,db);


