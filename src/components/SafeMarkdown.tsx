import React from 'react';

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    if (listOrdered) {
      blocks.push(
        <ol key={`${keyPrefix}-ol`} className="my-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineBold(item)}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={`${keyPrefix}-ul`} className="my-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineBold(item)}</li>
          ))}
        </ul>
      );
    }
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`b-${idx}`);
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listOrdered) {
        flushList(`b-${idx}`);
      }
      listOrdered = false;
      listItems.push(bulletMatch[1]);
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listOrdered) {
        flushList(`b-${idx}`);
      }
      listOrdered = true;
      listItems.push(orderedMatch[1]);
      return;
    }

    flushList(`b-${idx}`);

    const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        <h4 key={`h-${idx}`} className="mt-3 mb-1 font-display text-sm font-semibold text-slate-900">
          {renderInlineBold(headingMatch[1])}
        </h4>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="my-1.5 text-sm leading-relaxed text-slate-700">
        {renderInlineBold(line)}
      </p>
    );
  });

  flushList('end');

  return <div className="space-y-0.5">{blocks}</div>;
}
