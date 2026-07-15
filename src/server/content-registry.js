import { LEARN_ARTICLES } from './learn-content.js';
import { articleInventory } from './article-content.js';

function countWords(values) {
  return values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
}

function learnInventory() {
  return LEARN_ARTICLES.map((article) => ({
    path: `/learn/${article.slug}`,
    slug: article.slug,
    type: 'tutorial',
    title: article.title,
    description: article.description,
    category: article.shortTitle,
    updated: article.updated || '2026-07-15',
    published: article.published || article.updated || '2026-07-15',
    minutes: article.minutes,
    wordCount: countWords([
      article.intro,
      article.learningOutcomes || [],
      article.sections.map((section) => [section.title, section.paragraphs || [], section.bullets || [], section.note || '']),
      article.faq || [],
    ]),
    sections: article.sections.length,
    targetQuery: article.keywords?.[0] || '',
  }));
}

export function contentInventory() {
  return [...learnInventory(), ...articleInventory()].sort((a, b) => a.path.localeCompare(b.path));
}

export function contentByPath() {
  return new Map(contentInventory().map((item) => [item.path, item]));
}
