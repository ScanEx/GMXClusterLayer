const concat = require('gulp-concat')
const gulp = require('gulp')

const srcFiles = ['RotatedMarker.js', 'ClusterLayer.js']

gulp.task('default', () => {
    return gulp.src(srcFiles)
        .pipe(concat('clusterLayer.js'))
        .pipe(gulp.dest('dist'))
})

gulp.task('watch', ['default'], function () {
    gulp.watch(srcFiles, ['default'])
})
