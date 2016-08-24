const concat = require('gulp-concat')
const iife = require('gulp-iife')
const gulp = require('gulp')

const srcFiles = ['RotatedMarker.js', 'ClusterLayer.js']

gulp.task('default', () => {
    return gulp.src(srcFiles)
        .pipe(concat('clusterLayer.js'))
        .pipe(iife())
        .pipe(gulp.dest('dist'))
})

gulp.task('watch', ['default'], function () {
    gulp.watch(srcFiles, ['default'])
})
