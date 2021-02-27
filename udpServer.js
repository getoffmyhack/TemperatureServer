const fs        = require('fs');
const dayjs     = require('dayjs');

const dgram     = require('dgram');
const server    = dgram.createSocket('udp4');

var port;
var db;

// set api version
const apiVersion = "0.1";

module.exports ={
    start
}

function start(udpPort, database) {
    
    port = udpPort;
    db = database;
    server.bind(port);

}

server.on('error', (err) => {

    console.log(`server error:\n${err.stack}`);
    server.close();

});

server.on('message', (msg, remote) => {
    
    let now = dayjs();
    var cur_date = now.format("YYYYMMDD");
    var cur_time = now.format("hh:mm:ss");
    var iso8601 = now.format("YYYY-MM-DDTHH:mm:ss");
    var filename = `./csv/${cur_date}_temp.csv`;

    console.log(`Packet from ${remote.address}:${remote.port}: ${msg}`);

    if(msg == "SERVER?") {

        console.log(`\tSending ${apiVersion} to ${remote.address}.${remote.port}`);
        server.send(apiVersion, 0, apiVersion.length, remote.port, remote.address);

    } else if(msg == "DATETIME?") {

        console.log(`\tSending ${iso8601} to ${remote.address}.${remote.port}`);
        server.send(iso8601, 0, iso8601.length, remote.port, remote.address);

    } else {

        // convert msg buffer to string;
        var incomingData = msg.toString();

        // remove double quotes from string
        incomingData = incomingData.split('"').join('');

        // separate data into an array
        var temperatureData = incomingData.split(',');
        temperatureData[0] = dayjs(temperatureData[0], 'MM/DD/YY HH:mm').format('YYYY-MM-DD HH:mm')
        
        var sql ='INSERT INTO temperatures (datetime, temperature) VALUES (?,?)'
        
        db.run(sql, temperatureData, function (err, result) {
            if (err) throw err;
        });

        if(!global.DEVMODE) {

            msg = msg + "\n";
            // console.log("writing to file %s", filename);
            fs.appendFile(filename, msg, function (err) {
                if (err) throw err;
            });

        }
    }

});

server.on('listening', () => {

    var address = server.address();
    console.log('UDP  server listening: ', address)

});

