const fs = require('fs');
const path = require('path');

/**
 * Matches GFG parsed resources against the official GATE CS/IT syllabus.
 * Categorizes each topic, detects overlaps, extra non-GATE elements, and missing subjects.
 */
function matchSyllabus(gfgSubjects) {
  console.log('[Syllabus Matcher] Aligning GFG resources with official GATE CS/IT syllabus...');

  const gateSyllabus = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'gateSyllabus.json'), 'utf8')
  );
  const durationModel = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'subjectDurationModel.json'), 'utf8')
  );

  const matchedResult = [];
  const allTopicNames = [];
  const overlapChecker = {};

  // Pre-seed some standard overlaps for precise detection:
  const knownOverlaps = {
    'Graphs': ['Discrete Mathematics', 'Programming and Data Structures', 'Algorithms'],
    'Graph Traversal': ['Data Structures', 'Algorithms'],
    'Discrete Graph Theory': ['Discrete Mathematics', 'Algorithms'],
    'Hashing': ['Data Structures', 'Algorithms'],
    'Recursion': ['C Programming', 'Data Structures', 'Algorithms'],
    'Regular Languages': ['Theory of Computation', 'Compiler Design'],
    'Parsing': ['Theory of Computation', 'Compiler Design'],
    'Lexical Analysis': ['Theory of Computation', 'Compiler Design'],
    'Memory Management': ['Operating System', 'Computer Organization and Architecture'],
    "Cache Memory": ['Operating System', 'Computer Organization and Architecture'],
    'Cache': ['Operating System', 'Computer Organization and Architecture'],
    'Finite Automata': ['Theory of Computation', 'Compiler Design']
  };

  // Define GFG topics that contain content not directly tested under core GATE (Extra / non-GATE topics)
  const knownExtraTopics = [
    'File Handling', 
    'Structures and Unions', 
    'ROM and PLA implementation', 
    'Quine-McCluskey tabular minimization',
    'Strassen\'s matrix multiplication'
  ];

  gfgSubjects.forEach(subj => {
    const matchedTopics = [];
    
    subj.topics.forEach(topic => {
      const topicName = topic.name;
      let category = 'Core GATE';
      let isOverlapping = false;
      let overlappingSubjects = [];

      // 1. Check for overlapping topics
      const lowerName = topicName.toLowerCase();
      Object.keys(knownOverlaps).forEach(overlapKey => {
        if (lowerName.includes(overlapKey.toLowerCase())) {
          isOverlapping = true;
          overlappingSubjects = knownOverlaps[overlapKey].filter(s => s !== subj.subject);
          category = 'Overlapping';
        }
      });

      // 2. Check for extra/non-GATE topics
      knownExtraTopics.forEach(extra => {
        if (lowerName.includes(extra.toLowerCase())) {
          category = 'Extra / Non-GATE';
        }
      });

      // Track occurrences of topics
      if (!overlapChecker[lowerName]) {
        overlapChecker[lowerName] = [];
      }
      overlapChecker[lowerName].push(subj.subject);

      if (overlapChecker[lowerName].length > 1) {
        isOverlapping = true;
        overlappingSubjects = overlapChecker[lowerName].filter(s => s !== subj.subject);
        category = 'Overlapping';
      }

      // 3. Build matched topic representation
      matchedTopics.push({
        name: topicName,
        syllabusMatched: category === 'Core GATE' || category === 'Overlapping',
        category: category,
        isOverlapping: isOverlapping,
        overlappingSubjects: overlappingSubjects,
        estimatedHours: topic.estimatedHours || 6,
        difficulty: topic.difficulty || 'Intermediate',
        resourceLink: topic.resourceLink || '',
        learningObjectives: topic.learningObjectives || [`Master ${topicName}`],
        recommendedPyqs: topic.recommendedPyqs || 8,
        tags: [topic.difficulty || 'Intermediate'] // default tags
      });

      allTopicNames.push(topicName.toLowerCase());
    });

    const subjectModel = durationModel[subj.subject];
    const allEstimatedHours = matchedTopics.reduce((sum, topic) => sum + (topic.estimatedHours || 6), 0);

    matchedResult.push({
      subject: subj.subject,
      weightage: subj.weightage || 6.0,
      difficulty: subj.difficulty || 'Intermediate',
      targetHours: subjectModel ? subjectModel.targetHours : allEstimatedHours,
      durationSource: subjectModel ? subjectModel.source : 'GFG fallback estimate',
      topics: matchedTopics,
      missingTopics: [] // Will populate after scanning all
    });
  });

  // 4. Detect Missing Syllabus Topics
  // We compare the official gateSyllabus against all parsed topic names
  gateSyllabus.forEach(section => {
    // Find matching subject in our GFG results
    const subjectResult = matchedResult.find(r => 
      r.subject.toLowerCase().includes(section.section.toLowerCase()) ||
      section.section.toLowerCase().includes(r.subject.toLowerCase())
    );

    if (subjectResult) {
      section.coreTopics.forEach(coreTopic => {
        // Simple search if coreTopic name appears in any of the extracted topic names
        const words = coreTopic.toLowerCase().split(/[,\s:]+/);
        const matchFound = allTopicNames.some(extractedName => 
          extractedName.includes(coreTopic.toLowerCase().substring(0, 15)) ||
          words.slice(0, 2).join(' ').length > 4 && extractedName.includes(words.slice(0, 2).join(' '))
        );

        if (!matchFound) {
          // Add as a missing topic
          subjectResult.missingTopics.push({
            name: coreTopic.length > 50 ? coreTopic.substring(0, 50) + '...' : coreTopic,
            fullDescription: coreTopic,
            estimatedHours: 6,
            difficulty: 'Advanced',
            category: 'Missing GATE'
          });
        }
      });
    }
  });

  matchedResult.forEach(subjectResult => {
    if (!subjectResult.targetHours) return;

    const currentHours = [
      ...subjectResult.topics,
      ...subjectResult.missingTopics
    ].reduce((sum, topic) => sum + (topic.estimatedHours || 6), 0);

    if (currentHours <= 0) return;

    const scale = subjectResult.targetHours / currentHours;
    subjectResult.topics = subjectResult.topics.map(topic => ({
      ...topic,
      estimatedHours: Math.max(2, Math.round((topic.estimatedHours || 6) * scale))
    }));
    subjectResult.missingTopics = subjectResult.missingTopics.map(topic => ({
      ...topic,
      estimatedHours: Math.max(2, Math.round((topic.estimatedHours || 6) * scale))
    }));
  });

  return matchedResult;
}

module.exports = { matchSyllabus };
