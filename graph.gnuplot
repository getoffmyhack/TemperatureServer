set datafile separator ','

set xdata time # tells gnuplot the x axis is time data
set timefmt "%m/%d/%y %H:%M" # specify our time string format
set format x "%H:%M" # otherwise it will show only MM:SS

set key autotitle columnhead # use the first line as title
set ylabel "Temperature ˚F" # label for the Y axis
set xlabel 'Time' # label for the X axis

set title "Plot Title"
show title

set style line 100 lt 1 lc rgb "grey" lw 0.5 # linestyle for the grid
set grid ls 100 # enable grid with specific linestyle
#set style line 101 lw 3 lt rgb "#f62aa0" 

# set ytics 1

# set xtics 60*60
#set xrange ["01/24/21 00:00":"01/24/21 23:59"]

set xtics border

set xtics rotate # rotate labels on the x axis
#set key right center # legend placement
set xtics 24*60*60

set term x11
#set term svg enhanced mouse
#set output "data_plot.svg"
#set term png
#unset output
# set output "data_plot.png"
#set term canvas name 'tempplot' size 1280,600
#set output "temp_plot.html"

unset key

filelist=system("ls ./csv/*.csv")
plot for [filename in filelist] filename using 1:2 with lines



# plot "20210124_temp.csv" using 1:2 with lines
