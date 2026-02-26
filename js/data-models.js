/**
 * EWU Design Program - Data Models
 * Centralized definition of student tracks and minors.
 */

export const minors = {
    ux: {
        name: 'UX/Interaction Design Minor',
        courses: ['DESN 338', 'DESN 348', 'DESN 458', 'DESN 366'],
        tracks: ['ux', 'interaction-design', 'web-development'],
        color: '#e74c3c',
        typical: true
    },
    animation: {
        name: 'Animation Minor',
        courses: ['DESN 326', 'DESN 355', 'DESN 365', 'DESN 336'],
        tracks: ['animation', 'motion'],
        color: '#f39c12',
        typical: false,
        note: 'UX, Interaction Design, and Web Dev students typically don\'t pursue this minor'
    },
    gameDesign: {
        name: 'Game Design Minor',
        courses: ['DESN 335', 'DESN 345', 'DESN 369', 'DESN 379'],
        tracks: ['animation', 'game-design'],
        color: '#27ae60',
        typical: true,
        note: 'Animation and Game Design students may pursue this minor'
    },
    graphicDesign: {
        name: 'Graphic Design Minor',
        courses: ['DESN 243', 'DESN 263', 'DESN 360', 'DESN 463'],
        tracks: ['all'],
        color: '#3498db',
        typical: true,
        note: 'Can be picked up along the way by any track'
    },
    photography: {
        name: 'Photography Minor',
        courses: ['DESN 350', 'DESN 301'],
        tracks: ['photography', 'visual-storytelling'],
        color: '#9b59b6',
        typical: true,
        note: 'PHOTO 350 only offered in Spring',
        seasonal: { 'DESN 350': 'spring' }
    },
    webDevelopment: {
        name: 'Web Development Minor',
        courses: ['DESN 368', 'DESN 369', 'DESN 379', 'DESN 468'],
        tracks: ['web-development', 'code-design'],
        color: '#667eea',
        typical: true
    }
};

export const studentTracks = {
    'ux': { name: 'UX Design', suggestedMinors: ['ux', 'graphicDesign', 'webDevelopment'] },
    'interaction-design': { name: 'Interaction Design', suggestedMinors: ['ux', 'graphicDesign', 'webDevelopment'] },
    'web-development': { name: 'Web Development', suggestedMinors: ['webDevelopment', 'graphicDesign', 'ux'] },
    'animation': { name: 'Animation', suggestedMinors: ['animation', 'gameDesign', 'graphicDesign'] },
    'game-design': { name: 'Game Design', suggestedMinors: ['gameDesign', 'animation', 'graphicDesign'] },
    'motion': { name: 'Motion Design', suggestedMinors: ['animation', 'graphicDesign'] },
    'photography': { name: 'Photography', suggestedMinors: ['photography', 'graphicDesign'] },
    'visual-storytelling': { name: 'Visual Storytelling', suggestedMinors: ['photography', 'graphicDesign'] },
    'code-design': { name: 'Code + Design', suggestedMinors: ['webDevelopment', 'gameDesign', 'graphicDesign'] }
};
