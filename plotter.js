
function getPlot(plotData, plotOptions) {

    // console.log(plotData);
    var gnuplot = require('gnu-plot');

    var plot = gnuplot();

    plot.set({term:     "png size 1280,600"});
    plot.set({output:   ""});
    plot.print('set datafile separator ","\n');
    plot.print('set xdata time\n');
    plot.print('set timefmt "%Y-%m-%d %H:%M"\n');
    
    if( 'xformat' in plotOptions) {
        plot.print('set format x "' + plotOptions.xformat + '"\n');
    } else  {
        plot.print('set format x "%H:%M"\n')
    }

    if('xtics' in plotOptions) {
        plot.print(`set xtics ${plotOptions.xtics}\n`);
    }

    if('max' in plotOptions) {
        plot.print(`set label 1 '${plotOptions.max.temp}' at ${plotOptions.max.date},${plotOptions.max.temp} textcolor "red"\n`);
    }

    if('min' in plotOptions) {
        plot.print(`set label 2 '${plotOptions.min.temp}' at ${plotOptions.min.date},${plotOptions.min.temp} textcolor "blue"\n`);
    }

    if('title' in plotOptions) {
        plot.print(`set title "${plotOptions.title}"\n`);
        plot.print(`show title\n`);
    }

    plot.print('set ylabel "Temperature ˚F"\n');
    plot.print('set xlabel "Time"\n');
    plot.print('set style line 100 lt 1 lc rgb "grey" lw 0.5\n');
    plot.print('set grid ls 100\n');
    // plot.print('set ytics 1;');
    // plot.print('set xtics 180*60;');
    plot.print('set xtics border\n');
    plot.print('set xtics rotate\n');
    plot.print('unset key\n');


    plot.print('$mydata << EOD\n');
    plotData.forEach(row => { 
        plot.print(row[0] + "," + row[1] + "\n");
    });
    plot.print('EOD\n');
    // plot.print('stats $mydata using (strptime(timefmt,strcol(1))):2\n');
    plot.print('plot $mydata using 1:2 with lines\n');


    // plot.print('plot \'-\' using 1:2 with lines\n');
    // plotData.forEach(row => { 
    //     var record = row[0] + "," + row[1];
    //     // console.log(record)
    //     plot.print(record + "\n");
    // });
    // plot.print("e\n");

    return plot;
}

function getPlotCSV() {
    var cp = require('child_process');
    
    var gnuplotSettings = '';

    gnuplotSettings += 'set term png size 1280,600;';
    // gnuplotSettings += 'set term canvas'
    gnuplotSettings += 'unset output;';
    gnuplotSettings += 'set datafile separator \',\';';
    gnuplotSettings += 'set xdata time;';
    gnuplotSettings += 'set timefmt "%m/%d/%y %H:%M";';
    gnuplotSettings += 'set format x "%m/%d";';
    gnuplotSettings += 'set ylabel "Temperature ˚F";';
    gnuplotSettings += 'set xlabel "Time";';
    gnuplotSettings += 'set style line 100 lt 1 lc rgb "grey" lw 0.5;';
    gnuplotSettings += 'set grid ls 100;';
    // gnuplotSettings += 'set ytics 1;'
    gnuplotSettings += 'set xtics 24*60*60;';
    gnuplotSettings += 'set xtics border;';
    gnuplotSettings += 'set xtics rotate;';
    gnuplotSettings += 'set key off;';

    // set arrow 1 from min_pos_x, min_y-0.2 to min_pos_x, min_y-0.02 lw 0.5
    // set arrow 2 from max_pos_x, max_y+0.2 to max_pos_x, max_y+0.02 lw 0.5
    // set label 1 'Minimum' at min_pos_x, min_y-0.3 centre
    // set label 2 'Maximum' at max_pos_x, max_y+0.3 centre

    gnuplotSettings += 'filelist=system("ls ./csv/*.csv");';
    gnuplotSettings += 'plot for [filename in filelist] filename using 1:2 with lines;';
    // gnuplotSettings += 'plot \'' + filename + '\' using 1:2 with lines;';

    var child = require('child_process')
    gnuplot = child.spawnSync('gnuplot', ['-e', gnuplotSettings]);

    return gnuplot.stdout; //= gnuplot.output.buffer;

}

module.exports ={
    getPlotCSV, getPlot
}
