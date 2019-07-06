const Crawler = require("crawler");
const domainMatch = require("domain-match");
const spawn = require("cross-spawn");
const accessibilityCommand = require('./accessibility');
const config = require('../config');

const urlList = [];
const crawler = new Crawler({ maxConnections: 10 });

const pageLoadCallback = (res, argv = {}) => {
  // Runs on each page load
  var $ = res.$;
  // $ is Cheerio by default
  //a lean implementation of core jQuery designed specifically for the server

  /* URI Object example properties
                uri:
                protocol: 'https:',
                slashes: true,
                auth: null,
                host: 'www.amazon.com',
                port: 443,
                hostname: 'www.amazon.com',
                hash: null,
                search: null,
                query: null,
                pathname: '/',
                path: '/',
                href: 'https://www.amazon.com/' }
            */

  const requestUri = res.request.uri;
  const uri = requestUri.protocol + "//" + requestUri.host + ":" + requestUri.port;
  console.log(`Beginning Search of ${uri}`);
  var count = 0;
  $("a").each((index, value) => {
    const href = value.attribs.href;

    if (!href) {
      //no href
      if (argv.verbose) {
        console.log("Parse href: no href found. skipping.");
      }
      return;
    }
    const isPageAnchor = href === "#" || href[0] === "#";
    if (isPageAnchor) {
      //we don't collect page anchors
      if (argv.verbose) {
        console.log(
          `Parse href: href was a # anchor tag. skipping: ${href}`
        );
      }
      return;
    }

    //check only for Local URLs
    const isSameDomain = domainMatch(uri, href);
    const isAbsoluteURL =
      href.includes("http://") || href.includes("https://");
    if (!isSameDomain && isAbsoluteURL) {
      //disgarding external Url;
      if (argv.verbose) {
        console.log(`Parse href: External url detected. Skipping: ${href}`);
      }
      return;
    }

    if (isSameDomain) {
      //likely an absolute url on this domain
      if (argv.verbose) {
        console.log("absolute url");
        console.log(href);
      }
      if (!urlList.includes(href)) {
        urlList.push(href);
      }
    } else {
      //assemble full url
      const fullHref = uri + href;
      if (argv.verbose) {
        console.log(fullHref);
      }
      if (!urlList.includes(href)) {
        urlList.push(fullHref);
      }
    }
    count++;
  });
  console.log(`Found ${count} pages`);
  runReport(urlList, argv);
};

const runReport = (urlList, argv = {}) => {
  // Runs after the URL List has been generated by the crawler
  console.log("Beginning report process. This can take some time!!");
  if (argv.verbose) console.log(urlList);

  const urlStringsCSV = urlList.join(",");

  const lighthouseCLI = "lighthouse-batch";
  const lighthouseBatch = spawn(lighthouseCLI, [
    "-s",
    urlStringsCSV,
    "--html",
    `--out=${config.reportPath}`,
    "-v"
  ]);

  //const ls = spawn('ls', ['-lh', '/usr']);

  lighthouseBatch.stdout.on("data", data => {
    console.log(`- ${data}`);
  });

  lighthouseBatch.stderr.on("data", data => {
    if (argv.verbose) {
      console.log(`-err ${data}`);
    }
  });

  lighthouseBatch.on("close", async code => {
    switch (code) {
      case 0:
        //everything worked
        console.log(`Report creation successful!! Code: ${code}`);
        // Run accessibility audit if specified
        if (argv.accessibility) await accessibilityCommand.handler(argv);
        break;
      case 1:
        //something went wrong
        console.log(`Something didn't work! Run again in --verbose and check the Error output! Code: ${code}`);
        break;
      default:
        //something unexpected
        console.log(`Oops. The program exited with an unknown exit code: ${code}. Report this on GitHub!`);
    }
    console.log(`child process exited with code ${code}`);
  });
};

module.exports = {
  command: 'report [url]',
  desc: 'Run a full site report against the target URL.',
  builder: argv => {
    argv
      .positional('url', {
        describe: 'url of site to run report against, example: https://www.thrillworks.com',
        type: 'string',
      })
      .option('accessibility', {
        describe: 'Run an accessibility audit after the site report.',
        alias: 'a',
        default: true,
        type: 'boolean'
      })
      .option('verbose', {
        describe: 'Turn on verbose logging.',
        alias: 'v',
        default: false,
        type: 'boolean'
      });
  },
  handler: (argv = {}) => {
    if (!argv.url) {
      // User did not provide a site to scrape
      console.log("No site specified. Stopping. Use --help for more information.");
    } else {
      // Queue just one URL, with default callback
      if (argv.verbose) console.log(`Beginning reports for ${argv.url}`);
      crawler.queue({
        uri: argv.url,
        callback: (err, res, done) => {
          if (err) console.log(err);
          else pageLoadCallback(res, argv);
          done();
        }
      });
    }
  }
};
