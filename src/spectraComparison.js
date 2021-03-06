'use strict';

const peakPicking = require('./peakPicking');
const massInPeaks = require('./massInPeaks');
const vectorify = require('./vectorify');
const cosine = require('./cosine');

/**
 * Preprocessing task over the signals
 * @ignore
 * @param {Chromatogram} chromatography - Chromatogram to process
 * @param {Object} [options] - Options object (same as spectraComparison)
 * @return {{peaks: Array<Object>, integratedMs: Array<Object>, vector: Array<Object>}} - Array of peaks, integrated mass spectra and weighted mass spectra
 */
function preprocessing(chromatography, options) {
    // peak picking
    let peaks = peakPicking(chromatography, options);
    peaks = peaks.sort((a, b) => a.index - b.index);

    // integrate mass in the peaks
    let ms = chromatography.findSerieByName('ms').data;
    let integratedMs = massInPeaks(peaks, ms, options);
    let vector = vectorify(integratedMs, options);

    return {
        peaks,
        integratedMs,
        vector
    };
}

const defaultOption = {
    thresholdFactor: 0,
    maxNumberPeaks: Number.MAX_VALUE,
    groupWidth: 0,
    heightFilter: 2,
    massPower: 3,
    intPower: 0.6,
    similarityThreshold: 0.7
};

/**
 * Returns the most similar peaks between two GC/MS and their similarities
 * @param {Chromatogram} chrom1 - First chromatogram
 * @param {Chromatogram} chrom2 - Second chromatogram
 * @param {Object} [options] - Options object
 * @param {Number} [options.thresholdFactor = 0] - Every peak that it's bellow the main peak times this factor fill be removed (when is 0 there's no filter)
 * @param {Number} [options.maxNumberPeaks = Number.MAX_VALUE] - Maximum number of peaks for each mass spectra (when is Number.MAX_VALUE there's no filter)
 * @param {Number} [options.groupWidth = 0] - When find a max can't be another max in a radius of this size
 * @param {Number} [options.heightFilter = 2] - Filter all objects that are bellow `heightFilter` times the median of the height
 * @param {Number} [options.massPower = 3] - Power applied to the mass values
 * @param {Number} [options.intPower = 0.6] - Power applied to the abundance values
 * @param {Number} [options.similarityThreshold = 0.7] - Minimum similarity value to consider them similar
 * @return {Object} - Most similar peaks and their similarities:
 * * `peaksFirst`: Array of peaks, integrated mass spectra and weighted mass spectra for the first chromatogram
 * * `peaksSecond`: Array of peaks, integrated mass spectra and weighted mass spectra for the second chromatogram
 * * `peaksSimilarity`: Array of similarities (Number)
 */
function spectraComparison(chrom1, chrom2, options) {
    options = Object.assign({}, defaultOption, options);

    // peak picking
    let reference = preprocessing(chrom1, options);
    let sample = preprocessing(chrom2, options);

    // similarity between MS
    const len = Math.max(sample.peaks.length, reference.peaks.length);
    let similarityPeaks = {
        chrom1: new Array(len),
        chrom2: new Array(len),
        similarity: new Array(len)
    };
    let similarLen = 0;

    // Similarity matrix
    for (let i = 0; i < sample.peaks.length; ++i) {
        let max = {similarity: -3};
        let biggerCounter = 0;
        for (let j = 0; j < reference.peaks.length; ++j) {
            let sim = cosine(sample.vector[i].x, sample.vector[i].y, reference.vector[j].x, reference.vector[j].y);

            if (sim > options.similarityThreshold && sim > max.similarity) {
                max = {
                    similarity: sim,
                    chrom1: reference.peaks[j],
                    chrom2: sample.peaks[i]
                };
            }
            if (sim > options.similarityThreshold) {
                ++biggerCounter;
            }
        }
        if (biggerCounter === 1) {
            similarityPeaks.chrom1[similarLen] = max.chrom1;
            similarityPeaks.chrom2[similarLen] = max.chrom2;
            similarityPeaks.similarity[similarLen++] = max.similarity;
        }
    }
    similarityPeaks.chrom1.length = similarLen;
    similarityPeaks.chrom2.length = similarLen;

    let duplicates = {};
    for (let i = 0; i < similarLen; ++i) {
        if (duplicates.hasOwnProperty(similarityPeaks.chrom1[i].x)) {
            duplicates[similarityPeaks.chrom1[i].x].push(i);
        } else {
            duplicates[similarityPeaks.chrom1[i].x] = [i];
        }
    }

    let peaksChrom1 = [];
    let peaksChrom2 = [];
    let peaksSimilarity = [];
    for (let val in duplicates) {
        if (duplicates[val].length === 1) {
            peaksChrom1.push(similarityPeaks.chrom1[duplicates[val][0]]);
            peaksChrom2.push(similarityPeaks.chrom2[duplicates[val][0]]);
            peaksSimilarity.push(similarityPeaks.similarity[duplicates[val][0]]);
        }
    }

    return {
        peaksFirst: peaksChrom1,
        peaksSecond: peaksChrom2,
        peaksSimilarity: peaksSimilarity,
    };
}

module.exports = spectraComparison;
