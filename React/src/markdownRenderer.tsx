import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './markdownRenderer.css';
import { IconCopy, IconCheck } from './icons';

interface MarkdownRendererProps {
    text: string;
    /** Kept for backwards compatibility; styling now comes from CSS tokens. */
    containerColor?: string;
}

const textOf = (node: React.ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
    return '';
};

const Pre: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({ children, ...props }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ''));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
    };
    return (
        <div className='md-pre'>
            <button className='md-copy' onClick={copy} aria-label='Copy code'>
                {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                {copied ? 'Copied' : 'Copy'}
            </button>
            <pre {...props}>{children}</pre>
        </div>
    );
};

const MarkdownRenderer = memo(({ text }: MarkdownRendererProps) => (
    <ReactMarkdown
        className="markdown-body"
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
            pre: ({ node, ...props }) => <Pre {...props} />,
            a: ({ node, ...props }) => <a target="_blank" rel="noreferrer" {...props} />,
        }}
    >
        {text}
    </ReactMarkdown>
));

export default MarkdownRenderer;
