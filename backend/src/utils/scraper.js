const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

/**
 * Scrapes or parses GeeksforGeeks GATE CS/IT batch resources.
 * Supports direct crawling (if HTML is supplied) or parsing a saved file (gfg_resources.html).
 * Automatically falls back to high-fidelity cached resources if no HTML is found.
 */
function scrapeGfgResources(localHtmlPath = 'gfg_resources.html') {
  console.log('[Scraper] Starting resource extraction...');
  
  const fallbackData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'gfgResources.json'), 'utf8')
  );

  let htmlContent = '';
  const searchPath = path.resolve(localHtmlPath);
  
  if (fs.existsSync(searchPath)) {
    console.log(`[Scraper] Found local GFG HTML dump at ${searchPath}. Parsing...`);
    htmlContent = fs.readFileSync(searchPath, 'utf8');
  } else {
    console.log(`[Scraper] No local HTML dump found at ${searchPath}. Using high-fidelity pre-compiled dataset.`);
    return fallbackData;
  }

  try {
    const $ = cheerio.load(htmlContent);
    const subjects = [];
    
    // Select headers and lists in typical GFG batch tabs
    // In GFG Batch pages, tracks and chapters are often rendered inside classes like:
    // .batch_page_content, .track-anchor, .chapter-list, accordion headers, etc.
    
    // We will support multiple selector strategies to extract subjects and topics dynamically:
    
    // Strategy 1: Look for accordion cards or list items
    const possibleChapters = $('.accordion, .chapter, .track, [class*="chapter"], [class*="track"]');
    
    if (possibleChapters.length > 0) {
      possibleChapters.each((i, el) => {
        const title = $(el).find('h3, h4, [class*="title"], [class*="header"]').first().text().trim();
        if (!title) return;
        
        const topics = [];
        $(el).find('li, a, [class*="topic"], [class*="item"]').each((j, topicEl) => {
          const name = $(topicEl).text().trim().replace(/^[0-9.\-\s]+/, ''); // strip numbers
          const url = $(topicEl).attr('href') || '';
          if (name && name.length > 3) {
            topics.push({
              name,
              estimatedHours: 6, // default estimate
              difficulty: 'Intermediate',
              resourceLink: url.startsWith('http') ? url : `https://www.geeksforgeeks.org${url}`,
              learningObjectives: [`Master GFG resource content on ${name}`],
              recommendedPyqs: 8
            });
          }
        });
        
        if (topics.length > 0) {
          subjects.push({
            subject: title,
            weightage: 5.0, // default
            difficulty: 'Intermediate',
            topics
          });
        }
      });
    }

    // Strategy 2: Look for list of headers followed by list items (standard documentation pages)
    if (subjects.length === 0) {
      $('h2, h3').each((i, el) => {
        const subjectName = $(el).text().trim();
        if (!subjectName || subjectName.length < 3 || subjectName.includes('Practice') || subjectName.includes('GeeksforGeeks')) return;
        
        // Find next ul/ol list
        const nextList = $(el).nextAll('ul, ol, div').first();
        const topics = [];
        
        nextList.find('li, a').each((j, li) => {
          const name = $(li).text().trim().replace(/^[0-9.\-\s]+/, '');
          const url = $(li).find('a').attr('href') || $(li).attr('href') || '';
          if (name && name.length > 2 && !name.startsWith('http')) {
            topics.push({
              name: name.split('\n')[0].trim(),
              estimatedHours: 5,
              difficulty: 'Intermediate',
              resourceLink: url.startsWith('http') ? url : `https://www.geeksforgeeks.org${url}`,
              learningObjectives: [`Master the fundamental principles of ${name}`],
              recommendedPyqs: 6
            });
          }
        });
        
        if (topics.length > 0) {
          subjects.push({
            subject: subjectName,
            weightage: 6.0,
            difficulty: 'Intermediate',
            topics
          });
        }
      });
    }

    // Validate that subjects were parsed successfully
    if (subjects.length === 0) {
      console.log('[Scraper] Cheerio parser found no structured subjects in the HTML. Applying standard preloaded GFG roadmap.');
      return fallbackData;
    }

    console.log(`[Scraper] Successfully parsed ${subjects.length} subjects from the saved HTML file!`);
    return subjects;
    
  } catch (err) {
    console.error('[Scraper] Parsing failed. Defaulting to pre-compiled high-fidelity GFG syllabus.', err);
    return fallbackData;
  }
}

module.exports = { scrapeGfgResources };
