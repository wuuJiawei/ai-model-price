import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './beui/Button.jsx';

function rowKey(row) {
  return `${row.model_id}-${row.provider_id}`;
}

function searchableText(row) {
  return [
    row.model_name,
    row.model_id,
    row.model_vendor,
    row.provider_name,
    row.provider_id,
    row.native_currency,
    row.input_native,
    row.output_native,
    row.cached_input_native,
    row.note,
    row.updated_at,
  ]
    .filter(value => value !== null && value !== undefined)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
}

function findRowElement(key) {
  return [...document.querySelectorAll('[data-search-key]')]
    .find(element => element.dataset.searchKey === key) || null;
}

export function SearchNavigator({ rows }) {
  const reduce = useReducedMotion();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘F' : 'Ctrl F';
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');

  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return rows
      .filter(row => searchableText(row).includes(normalizedQuery))
      .map(row => rowKey(row));
  }, [rows, normalizedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
        return;
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const nodes = [...document.querySelectorAll('[data-search-key]')];
    nodes.forEach(node => node.classList.remove('search-match', 'search-match-active'));

    if (!open || !normalizedQuery || matches.length === 0) return undefined;

    matches.forEach(key => findRowElement(key)?.classList.add('search-match'));
    const activeKey = matches[Math.min(activeIndex, matches.length - 1)];
    const activeNode = findRowElement(activeKey);
    if (activeNode) {
      activeNode.classList.add('search-match-active');
      requestAnimationFrame(() => {
        activeNode.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
      });
    }

    return () => nodes.forEach(node => node.classList.remove('search-match', 'search-match-active'));
  }, [open, normalizedQuery, matches, activeIndex, reduce]);

  const move = direction => {
    if (!matches.length) return;
    setActiveIndex(index => (index + direction + matches.length) % matches.length);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  return (
    <>
      <Button
        className="search-trigger"
        variant="outline"
        size="sm"
        aria-label={`搜索并定位，快捷键 ${shortcut}`}
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Search size={14} />
        <span className="search-trigger-label">定位</span>
        <kbd>{shortcut}</kbd>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="search-navigator"
            role="search"
            aria-label="页面搜索定位"
            initial={reduce ? false : { opacity: 0, y: -8, scale: .98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: .985 }}
            transition={{ duration: .16 }}
          >
            <Search size={15} className="search-navigator-icon" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  move(event.shiftKey ? -1 : 1);
                }
              }}
              placeholder="搜索模型或中转站…"
              aria-label="搜索模型或中转站"
            />
            <span className={`search-count ${normalizedQuery && matches.length === 0 ? 'is-empty' : ''}`} aria-live="polite">
              {normalizedQuery ? (matches.length ? `${Math.min(activeIndex, matches.length - 1) + 1}/${matches.length}` : '0/0') : '—'}
            </span>
            <span className="search-divider" />
            <Button variant="ghost" size="icon" disabled={!matches.length} aria-label="上一个匹配" onClick={() => move(-1)}><ChevronUp size={15} /></Button>
            <Button variant="ghost" size="icon" disabled={!matches.length} aria-label="下一个匹配" onClick={() => move(1)}><ChevronDown size={15} /></Button>
            <Button variant="ghost" size="icon" aria-label="关闭搜索" onClick={close}><X size={15} /></Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
