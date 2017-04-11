const fs = require('fs');
const path = require('path');
const chai = require('chai');
const karma = require('karma');
const rimraf = require('rimraf');
const karmaCoverageIstanbulReporter = require('../src/reporter');
const OUTPUT_LOG_FILE = require('./karma.conf').OUTPUT_LOG_FILE;

const expect = chai.expect;
const OUTPUT_PATH = path.join(__dirname, 'fixtures', 'outputs');
const OUTPUT_FILE = path.join(OUTPUT_PATH, 'coverage-summary.json');
const fileReadTimeout = 300;

function createServer(config) {
  config = config || {};
  return new karma.Server(Object.assign({
    configFile: path.join(__dirname, '/karma.conf.js'),
    plugins: [
      'karma-mocha',
      'karma-phantomjs-launcher',
      'karma-webpack',
      'karma-sourcemap-loader',
      karmaCoverageIstanbulReporter
    ]
  }, config), () => {});
}

describe('karma-coverage-istanbul-reporter', () => {
  beforeEach(() => {
    rimraf.sync(OUTPUT_PATH);
    rimraf.sync(OUTPUT_LOG_FILE);
    fs.mkdirSync(OUTPUT_PATH);
  });

  it('should generate a remapped coverage report', done => {
    const server = createServer();
    server.start();
    server.on('run_complete', () => {
      setTimeout(() => { // Hacky workaround to make sure the file has been written
        const summary = JSON.parse(fs.readFileSync(OUTPUT_FILE));
        expect(summary.total).to.deep.equal({
          lines: {
            total: 6,
            covered: 5,
            skipped: 0,
            pct: 83.33
          },
          statements: {
            total: 6,
            covered: 5,
            skipped: 0,
            pct: 83.33
          },
          functions: {
            total: 3,
            covered: 2,
            skipped: 0,
            pct: 66.67
          },
          branches: {
            total: 0,
            covered: 0,
            skipped: 0,
            pct: 100
          }
        });
        done();
      }, fileReadTimeout);
    });
  });

  it('should fix webpack loader source paths', done => {
    const server = createServer({
      coverageIstanbulReporter: {
        reports: ['json-summary'],
        dir: path.join(__dirname, 'fixtures', 'outputs'),
        fixWebpackSourcePaths: true
      }
    });
    server.start();
    server.on('run_complete', () => {
      setTimeout(() => { // Hacky workaround to make sure the file has been written
        const summary = JSON.parse(fs.readFileSync(OUTPUT_FILE));
        const files = Object.keys(summary);
        files.forEach(file => { // eslint-disable-line max-nested-callbacks
          expect(file).not.to.contain('tslint-loader');
        });
        done();
      }, fileReadTimeout);
    });
  });

  it('should output to the browser folder', done => {
    const server = createServer({
      coverageIstanbulReporter: {
        reports: ['json-summary'],
        dir: path.join(__dirname, 'fixtures', 'outputs', '%browser%')
      }
    });
    server.start();
    server.on('run_complete', () => {
      setTimeout(() => { // Hacky workaround to make sure the file has been written
        expect(Boolean(fs.readdirSync(OUTPUT_PATH).find(dir => dir.startsWith('PhantomJS')))).to.equal(true); // eslint-disable-line max-nested-callbacks
        done();
      }, fileReadTimeout);
    });
  });

  it('should not map files with no coverage', done => {
    const server = createServer({
      files: [
        'fixtures/typescript/src/ignored-file.ts'
      ],
      preprocessors: {
        'fixtures/typescript/src/ignored-file.ts': ['webpack', 'sourcemap']
      },
      logLevel: 'DEBUG',
      coverageIstanbulReporter: {
        reports: ['json-summary'],
        dir: path.join(__dirname, 'fixtures', 'outputs'),
        skipFilesWithNoCoverage: true
      }
    });
    server.start();
    server.on('run_complete', () => {
      setTimeout(() => { // Hacky workaround to make sure the file has been written
        const output = fs.readFileSync(OUTPUT_LOG_FILE).toString();
        expect(Boolean(output.match(/\[DEBUG\] reporter\.coverage-istanbul - File \[\/.+test\/fixtures\/typescript\/src\/ignored-file\.ts\] ignored, nothing could be mapped/))).not.to.equal(false);
        done();
      }, fileReadTimeout);
    });
  });

  describe('coverage thresholds', () => {
    it('should not meet the thresholds', done => {
      const server = createServer({
        singleRun: false, // Hack to make sure the test process doesn't exit with a failing error code
        coverageIstanbulReporter: {
          reports: ['json-summary'],
          dir: path.join(__dirname, 'fixtures', 'outputs'),
          thresholds: {
            statements: 100,
            lines: 100,
            branches: 100,
            functions: 100
          }
        }
      });
      server.start();

      function checkOutput() {
        const output = fs.readFileSync(OUTPUT_LOG_FILE).toString();
        expect(output).to.contain('[ERROR] reporter.coverage-istanbul - Coverage for statements (83.33%) does not meet global threshold (100%)');
        expect(output).to.contain('[ERROR] reporter.coverage-istanbul - Coverage for lines (83.33%) does not meet global threshold (100%)');
        expect(output).to.contain('[ERROR] reporter.coverage-istanbul - Coverage for functions (66.67%) does not meet global threshold (100%)');
        done();
      }

      server.on('run_complete', () => {
        setTimeout(checkOutput, fileReadTimeout); // Hacky workaround to make sure the output file has been written
      });
    });

    it('should meet the thresholds', done => {
      const server = createServer({
        coverageIstanbulReporter: {
          reports: ['json-summary'],
          dir: path.join(__dirname, 'fixtures', 'outputs'),
          thresholds: {
            statements: 50,
            lines: 50,
            branches: 50,
            functions: 50
          }
        }
      });
      server.start();

      function checkOutput() {
        const output = fs.readFileSync(OUTPUT_LOG_FILE).toString();
        expect(output).not.to.contain('[ERROR] reporter.coverage-istanbul - Coverage for statements (83.33%) does not meet global threshold (50%)');
        expect(output).not.to.contain('[ERROR] reporter.coverage-istanbul - Coverage for lines (83.33%) does not meet global threshold (50%)');
        expect(output).not.to.contain('[ERROR] reporter.coverage-istanbul - Coverage for functions (66.67%) does not meet global threshold (50%)');
        done();
      }

      server.on('run_complete', () => {
        setTimeout(checkOutput, fileReadTimeout); // Hacky workaround to make sure the output file has been written
      });
    });
  });
});