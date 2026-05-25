/**
 * Export System Utility
 * Formats generated study planners into CSV (Excel-ready) and iCalendar (ICS) formats,
 * and outputs print-ready styles for clean PDF prints.
 */

/**
 * Exports calendar data into CSV string format.
 */
function exportToCSV(calendarData) {
  console.log('[Export System] Formatting calendar into CSV...');
  let csv = 'Date,Day of Week,Subject,Topic,Task Type,Duration (Hours),Difficulty,Status,Resource Link\n';

  calendarData.forEach(day => {
    if (day.tasks.length === 0) {
      csv += `"${day.date}","${day.dayOfWeek}","Rest Day","No tasks scheduled","rest",0,"","Completed",""\n`;
    } else {
      day.tasks.forEach(task => {
        const subject = (task.subject || '').replace(/"/g, '""');
        const name = (task.topicName || '').replace(/"/g, '""');
        const type = task.type || 'study';
        const duration = task.duration || 0;
        const difficulty = task.difficulty || '';
        const status = task.completed ? 'Completed' : 'Pending';
        const link = task.resourceLink || '';
        
        csv += `"${day.date}","${day.dayOfWeek}","${subject}","${name}","${type}",${duration},"${difficulty}","${status}","${link}"\n`;
      });
    }
  });

  return csv;
}

/**
 * Exports calendar data into RFC 5545 compliant iCalendar (ICS) format.
 * Enables direct imports into Google Calendar, Apple Calendar, Outlook, and Notion.
 */
function exportToICS(calendarData) {
  console.log('[Export System] Formatting calendar into ICS feed...');
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//GATE CS Study Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  calendarData.forEach(day => {
    const formattedDate = day.date.replace(/-/g, ''); // YYYYMMDD
    
    day.tasks.forEach((task, idx) => {
      const uniqueId = `gate-task-${formattedDate}-${idx}@gateplanner.ai`;
      const summary = `[GATE Prep] ${task.subject}: ${task.topicName}`;
      
      let description = `Type: ${task.type.toUpperCase()}\\n`;
      if (task.difficulty) description += `Difficulty: ${task.difficulty}\\n`;
      if (task.recommendedPyqs) description += `Recommended PYQs: ${task.recommendedPyqs}\\n`;
      if (task.resourceLink) description += `Resource Link: ${task.resourceLink}\\n`;
      if (task.learningObjectives && task.learningObjectives.length > 0) {
        description += `\\nLearning Objectives:\\n- ${task.learningObjectives.join('\\n- ')}`;
      }

      // Add task to ICS as all-day event
      ics.push(
        'BEGIN:VEVENT',
        `UID:${uniqueId}`,
        `DTSTAMP:${formattedDate}T090000Z`,
        `DTSTART;VALUE=DATE:${formattedDate}`,
        `DTEND;VALUE=DATE:${getNextDateString(day.date)}`,
        `SUMMARY:${escapeSpecialChars(summary)}`,
        `DESCRIPTION:${escapeSpecialChars(description)}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT'
      );
    });
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

/**
 * Helper to escape special characters for ICS format
 */
function escapeSpecialChars(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Helper to get day after target day for ICS DTEND boundary
 */
function getNextDateString(dateString) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

module.exports = { exportToCSV, exportToICS };
