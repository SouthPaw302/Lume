"use strict";
const projects = require("../../project-registry.json");

function detectProject(...values) {
  let text = "";
  try { text = JSON.stringify(values).toLowerCase().slice(0, 20_000); } catch (_) { return null; }
  return projects.find(project => project.patterns.some(pattern => text.includes(pattern.toLowerCase()))) || null;
}

function projectMetadata(project) {
  return project ? { project_id: project.id, project_label: project.label, project_accent: project.accent } : {};
}

module.exports = { detectProject, projectMetadata, projects };
