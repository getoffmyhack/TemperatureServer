var express     = require('express');
var plotter     = require('./plotter.js');
var dayjs       = require('dayjs');
var morgan      = require('morgan');
var fs          = require('fs');
var path        = require('path');
var bodyParser  = require('body-parser');
var cuid        = require('cuid');


const httpApp   = express();
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'log/access.log'), { flags: 'a' })

httpApp.use(morgan('combined', { stream: accessLogStream }));
httpApp.use(bodyParser.urlencoded({ extended: true })); 
httpApp.set('view engine', 'ejs');
httpApp.use(express.static('static'))

var utc = require('dayjs/plugin/utc')
dayjs.extend(utc);

var port;
var server;
var db;

var requestID;

module.exports ={
    start
}

/*---------------------------------------------------------------------------*\

Start the HTTP server

\*---------------------------------------------------------------------------*/

function start(httpPort, database) {
    
    port = httpPort;
    db = database;

    server = httpApp.listen(httpPort, '0.0.0.0', () => {
    
        var address = server.address();
        console.log('HTTP server listening: ', address);
    
    });

}

/*---------------------------------------------------------------------------*\

Callback

Retrieves MAX / MIN dates from SQL for form element constraints
Retrieves current temperature with MAX date

\*---------------------------------------------------------------------------*/

var getDateStatsFromDB = (req, res, next) => {
    
    // chain SQL requests to get required data stats

    // get max datetime and current temperature
    let sql = 'SELECT MAX(datetime)as maxdate, temperature FROM temperatures';
    db.get(sql, [], (err, row) => {    

        res.locals.currentTemp = row.temperature;
        res.locals.maxDate = dayjs(row.maxdate, 'YYYY-MM-DD HH:mm');

        // get min datetime
        let minSql = 'SELECT MIN(datetime) as mindate FROM temperatures';

        db.get(minSql, [], (err, row) => {
            res.locals.minDate = dayjs(row.mindate, 'YYYY-MM-DD HH:mm');
            next();
        });
    });
}

/*---------------------------------------------------------------------------*\

Callback

Retreives requestObject from db containing the min/max temperature and their
respective dates.

\*---------------------------------------------------------------------------*/

var getRequestData = (req, res, next) => {

    // get request object for this requestID
    let sql = 'SELECT * FROM requestcache where requestid = (?)'
    db.get(sql, [req.params.reqID], (err, row) => {    
        
        if(row !== undefined) {
            res.locals.requestObject = JSON.parse(row.requestobj);
        }
        next();

    });
}
/*---------------------------------------------------------------------------*\

Callback

Retrieves MAX/MIN values from SQL for today's data

\*---------------------------------------------------------------------------*/

var getDataStatsFromDBForToday = (req, res, next) => {

    let maxSql = "select max(temperature) as maxtemp, datetime from temperatures where datetime >= date('now', 'localtime')";
    let minSql = "select min(temperature) as mintemp, datetime from temperatures where datetime >= date('now', 'localtime')";

    db.get(maxSql, [], (err, row) => {    
        
        res.locals.maxTemp = row.maxtemp;
        res.locals.maxTempDate = dayjs(row.datetime, 'YYYY-MM-DD HH:mm');

        db.get(minSql, [], (err, row) => {

            res.locals.minTemp = row.mintemp;
            res.locals.minTempDate = dayjs(row.datetime, 'YYYY-MM-DD HH:mm');
            next();

        });

    });

}

/*---------------------------------------------------------------------------*\

Callback

Retrieves MAX/MIN data from SQL using the POSTed form values to determine
the constraints of the queries (the WHERE clause)

\*---------------------------------------------------------------------------*/

var getDataStatsFromDBForRequest = (req, res, next) => {

    var maxSql      = "select max(temperature) as maxtemp, datetime from temperatures ";
    var minSql      = "select min(temperature) as mintemp, datetime from temperatures ";
    var where       = "";
    var sqlParams   = [];

    switch(req.body.method) {
        
        case "direct":
            switch(req.body.value) {
                case "last24":
                    where = "where datetime >= datetime('now', '-1 day', 'localtime')";                  
                break;

                case "all":
                    // where clause not needed... yet. see (https://www.sqlitetutorial.net/sqlite-max/)
                    // using subquery
                break;

                case "csv":
                    // not using sql, but as long as the data is sync'd with sql, same as 'all' above
                break;
            }

        break;
        
        case "span":

            var count = req.body.count;
            var span  = req.body.span;

            if(span == 'weeks') {
                count = count * 7;
                span  = 'days';
            }

            var range = `-${count} ${span}`;

            sqlParams.push(range);
            where = "where datetime >= datetime('now', ?, 'localtime')"

        break;

        case "day":
            
            sqlParams.push(req.body.date);
            where = "where strftime('%Y-%m-%d', datetime) = date(?)";

        break;

        case "month":
            var date = req.body.date + "-01";

            // push date twice to be used as both params in query
            sqlParams.push(date);
            sqlParams.push(date);
            where  = `where ( strftime('%Y-%m-%d', datetime) >= date(?) ) and `;
            where += `( strftime('%Y-%m-%d', datetime) < date(?, '+1 month') )`;
            
        break;

        case "range":

            sqlParams.push(req.body.startdate);
            sqlParams.push(req.body.enddate);

            where  = `where ( strftime('%Y-%m-%d', datetime) >= date(?) ) and `
            where += `( strftime('%Y-%m-%d', datetime) <= date(?) )`;

        break;

    }

    maxSql += where;
    minSql += where;

    db.get(maxSql, sqlParams, (err, row) => {    

        res.locals.maxTemp = row.maxtemp;
        res.locals.maxTempDate = dayjs(row.datetime, 'YYYY-MM-DD HH:mm');

        db.get(minSql, sqlParams, (err, row) => {

            res.locals.minTemp = row.mintemp;
            res.locals.minTempDate = dayjs(row.datetime, 'YYYY-MM-DD HH:mm');
            next();

        });

    });

}

/*---------------------------------------------------------------------------*\

Unique requestID

Generates a "unique" request id used to retrieve objects from app.locals

\*---------------------------------------------------------------------------*/

httpApp.all('*', function(req, res, next) {
    
    res.locals.requestID = cuid();

    // clear expired cached request data
    var sql ="DELETE FROM requestcache WHERE expire < datetime('now');"
    db.run(sql, [], function (err, result) {
        if (err) throw err;
    });

    return next();

});

/*---------------------------------------------------------------------------*\

Main site entry point

Show plot data beginning midnight today

\*---------------------------------------------------------------------------*/

httpApp.get('/', [ getDateStatsFromDB, getDataStatsFromDBForToday ], function(req, res) {

    var reqID = res.locals.requestID;

    var plotpath = `/plot/${reqID}/direct/today`;

    var header = res.locals.maxDate.format('ddd, DD MMM YYYY') + " through " + res.locals.maxDate.format('hh:mm a');

    var max = {
        'maxTemp': res.locals.maxTemp,
        'maxDate': res.locals.maxTempDate.format('hh:mm a')
    };

    var min = {
        'minTemp': res.locals.minTemp,
        'minDate': res.locals.minTempDate.format('hh:mm a')
    };

    var footerData = {
        'max': max,
        'min': min
    };


    //dayjs.utc(row.datetime, 'YYYY-MM-DD HH:mm').unix()
    var requestObject = JSON.stringify({
        'max': {'temp': res.locals.maxTemp, 'date': dayjs.utc(res.locals.maxTempDate.format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm').unix()},
        'min': {'temp': res.locals.minTemp, 'date': dayjs.utc(res.locals.minTempDate.format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm').unix()}
    });

    var sql = "INSERT INTO requestcache (requestid, requestobj, expire) VALUES (?,?, datetime('now', '+5 seconds'))"

    var requestParams = [ reqID, requestObject ];

    db.run(sql, requestParams, function (err, result) {
        if (err) throw err;
        res.render('pages/index.ejs', { 
            plotpath: plotpath, 
            dayjs: dayjs, 
            currentTemp: res.locals.currentTemp, 
            mindate: res.locals.minDate, 
            header: header, 
            footerdata: footerData
        });
    });
});

/*---------------------------------------------------------------------------*\

Post handler 

\*---------------------------------------------------------------------------*/

httpApp.post('/', [ getDateStatsFromDB, getDataStatsFromDBForRequest ], function(req, res) {

    var plotpath    = "";
    var header      = "";
    var dateFormat  = 'ddd, DD MMM YYYY hh:mm a';
    
    var reqID = res.locals.requestID;

    switch(req.body.method) {
        
        case "direct":
            
            plotpath = "/plot/" + reqID + "/" + req.body.method + "/" + req.body.value;
            switch(req.body.value) {
                case "last24":
                    header  = "Last 24 hours - ";
                    header += res.locals.maxDate.subtract(1, 'day').format('ddd, DD MMM YYYY hh:mm a');
                    header += " through " + res.locals.maxDate.format('ddd, DD MMM YYYY hh:mm a');
                break;

                case "all":
                    // header  = "Temperature plot for ";
                    header += res.locals.minDate.format('ddd, DD MMM YYYY hh:mm a');
                    header += " through " + res.locals.maxDate.format('ddd, DD MMM YYYY hh:mm a');
                break;

                case "csv":
                    header = "Plotting all CSV files";
                break;
            }

        break;
        
        case "span":

            plotpath = "/plot/" + reqID + "/" + req.body.method + "/" + req.body.count + "/" + req.body.span;
            header = "Plotting Last " + req.body.count + " " + req.body.span;

        break;

        case "day":
        case "month":

            plotpath = "/plot/" + reqID + "/" + req.body.method + "/" + req.body.date;
            if(req.body.method == "day") {
                header = dayjs(req.body.date, 'YYYY-MM-YY').format('ddd, DD MMM YYYY');
                dateFormat = 'hh:mm a';
            } else {
                header = dayjs(req.body.date, 'YYYY-MM-YY').format('MMM YYYY');
            }

        break;

        case "range":

            plotpath = "/plot/" + reqID + "/" + req.body.method + "/" + req.body.startdate + "/" + req.body.enddate;
            header  = dayjs(req.body.startdate, 'YYYY-MM-YY').format('ddd, DD MMM YYYY');
            header += " - " + dayjs(req.body.enddate, 'YYYY-MM-YY').format('ddd, DD MMM YYYY');

        break;

    }

    var max = {
        'maxTemp': res.locals.maxTemp,
        'maxDate': res.locals.maxTempDate.format(dateFormat)
    };

    var min = {
        'minTemp': res.locals.minTemp,
        'minDate': res.locals.minTempDate.format(dateFormat)
    };

    var footerData = {
        'max': max,
        'min': min
    };

    var requestObject = JSON.stringify({
        'max': {'temp': res.locals.maxTemp, 'date': dayjs.utc(res.locals.maxTempDate.format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm').unix()},
        'min': {'temp': res.locals.minTemp, 'date': dayjs.utc(res.locals.minTempDate.format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm').unix()}
    });

    // var currentTemp = res.locals.currentTemp;
    // var minDate = res.locals.minDate;
    
    // var requestObject = JSON.stringify(httpApp.locals[reqID]);

    var sql = "INSERT INTO requestcache (requestid, requestobj, expire) VALUES (?,?, datetime('now', '+5 seconds'))"

    var requestParams = [ reqID, requestObject ];

    db.run(sql, requestParams, function (err, result) {
        if (err) throw err;
        res.render('pages/index.ejs', { 
            plotpath: plotpath, 
            dayjs: dayjs, 
            currentTemp: res.locals.currentTemp, 
            mindate: res.locals.minDate, 
            header: header, 
            footerdata: footerData
        });
    });

})

//*****************************************************************************
//
//  Plot API
//
//*****************************************************************************

/*---------------------------------------------------------------------------*\

Plot all data from SQL

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/direct/all', [getRequestData], (req, res) => {
    
    var plotOptions = {
        'xformat': '%m/%d',
        'xtics': 24*60*60
    };

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    var sql     = "SELECT * from temperatures order by datetime";

    db.all(sql, [], (err, rows) => {
        
        var pointArray = [];
        
        if (err) {
            throw err;
        }
                
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
          
        var plot = plotter.getPlot(pointArray, plotOptions);
        
        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();
        
    });

});

/*---------------------------------------------------------------------------*\

Plot all data from CSV files

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/direct/csv', (req, res) => {
    
    var plot = plotter.getPlotCSV();

    res.setHeader('content-type', 'image/png');
    // res.setHeader('content-type', 'image/svg+xml');

    res.send(plot);

});

/*---------------------------------------------------------------------------*\

Plot last 24 hours => (current time - 24 hours) to current time

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/direct/last24', [getRequestData], (req, res) => {
    
    var plotOptions = {
        'xtics':    60*60,
    };

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    let sql = "select * from temperatures where datetime >= datetime('now', '-1 day', 'localtime') order by datetime";

    db.all(sql, [], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();

    });

});

/*---------------------------------------------------------------------------*\

Plot today => midnight to current time

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/direct/today', [getRequestData], (req, res) => {
    
    var plotOptions = {
        'xtics': 60*60,
    };

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    let sql = "select * from temperatures where datetime >= date('now', 'localtime') order by datetime";

    db.all(sql, [], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        // res.setHeader('content-type', 'image/svg+xml');
        res.setHeader('content-type', 'image/png');
        plot.stdout.pipe(res);
        plot.end();

    });

});

/*---------------------------------------------------------------------------*\

Plot single day => :date is YYYY-MM-DD

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/day/:date', [getRequestData], (req, res) => {
    
    var date = req.params.date;
    var plotOptions = {
        'xtics': 60*60
    };

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    let sql = `SELECT * from temperatures where strftime('%Y-%m-%d', datetime) = date(?) order by datetime`;

    db.all(sql, [date], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();

    });

});

/*---------------------------------------------------------------------------*\

Plot Month => :date is YYYY-MM

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/month/:date', [getRequestData], (req, res) => {
    
    var date = req.params.date + "-01";
    var plotOptions = {
        'xformat': '%m/%d',
        'xtics': 24*60*60
    };

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    var sql  = `SELECT * from temperatures where `;
        sql += `( strftime('%Y-%m-%d', datetime) >= date(?) ) and `
        sql += `( strftime('%Y-%m-%d', datetime) < date(?, '+1 month') ) order by datetime`;

    db.all(sql, [date, date], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();

    });

});

/*---------------------------------------------------------------------------*\

plot time span => from '-:count :span' to current date and time;
span: (hours | days | weeks | months | years)

Ex: /plot/span/48/hours - plots the previous (-)48 hours

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/span/:count(\\d+)/:span(hours|days|weeks|months|years)', [getRequestData], (req, res) => {
    
    var count = req.params.count;
    var span  = req.params.span;
    var plotOptions = {};

    if(span == 'weeks') {
        count = count * 7;
        span  = 'days';
        plotOptions = {
            'xformat': '%a\\n%m/%d',
            'xtics': 24*60*60
        };
    }

    if(span == 'months') {
        plotOptions = {
            'xformat': '%m/%d',
            'xtics': 24*60*60
        };
    }

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    var range = `-${count} ${span}`;
    
    let sql = "select * from temperatures where datetime >= datetime('now', ?, 'localtime') order by datetime;"

    db.all(sql, [range], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();

    });

});

/*---------------------------------------------------------------------------*\

plot a range of dates => :startdate through :enddate

\*---------------------------------------------------------------------------*/

httpApp.get('/plot/:reqID/range/:startdate/:enddate', [getRequestData], (req, res) => {
    
    var startdate = req.params.startdate;
    var enddate   = req.params.enddate;
    var plotOptions = {};

    if('requestObject' in res.locals) {
        var reqObj = res.locals.requestObject;
        plotOptions.max = reqObj.max;
        plotOptions.min = reqObj.min;
    }

    var sql  = `SELECT * FROM temperatures WHERE `;
        sql += `( strftime('%Y-%m-%d', datetime) >= date(?) ) and `
        sql += `( strftime('%Y-%m-%d', datetime) <= date(?) ) order by datetime`;

    db.all(sql, [startdate, enddate], (err, rows) => {
        
        var pointArray = [];

        if (err) {
            throw err;
        }
        
        rows.forEach((row) => {
            var dataRec = [ row.datetime, row.temperature];
            pointArray.push(dataRec);
        });
  
        var plot = plotter.getPlot(pointArray, plotOptions);

        res.setHeader('content-type', 'image/png');
        // res.setHeader('content-type', 'image/svg+xml');

        plot.stdout.pipe(res);
        plot.end();

    });

});



