import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = inline || !match;
            const codeContent = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code className={cn("bg-black/10 dark:bg-white/10 rounded px-1 py-0.5", className)} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match ? match[1] : ''} value={codeContent} {...props} />
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-7">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-6 mb-4">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-6 mb-4">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-2xl font-bold mt-6 mb-4 border-b pb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-lg font-bold mt-4 mb-2">{children}</h3>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{children}</a>;
          },
          blockquote({ children }) {
            return <blockquote className="border-l-4 border-gray-300 dark:border-gray-700 pl-4 italic my-4">{children}</blockquote>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [isCopied, setIsCopied] = React.useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      delete (codeRef.current as HTMLElement & { dataset: { highlighted?: string } }).dataset.highlighted;
      hljs.highlightElement(codeRef.current);
    }
  }, [value, language]);

  const copyToClipboard = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 font-sans">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
        <span className="font-mono uppercase font-semibold">{language || 'text'}</span>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          aria-label="Copy code"
        >
          {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          <span>{isCopied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 bg-[#0d1117] overflow-x-auto text-sm">
        <code ref={codeRef} className={cn("font-mono text-gray-200", language && `language-${language}`)}>
          {value}
        </code>
      </div>
    </div>
  );
}

