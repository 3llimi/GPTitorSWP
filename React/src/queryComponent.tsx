import React, { useEffect, useState } from 'react';
import './queryComponent.css';
import API_URL from './config';
import { useToast } from './toast';
import { IconMessage, IconPencil, IconStar, IconTrash, IconCheck, IconX } from './icons';

type QueryComponentProps = {
  display_id: number;
  stored_id: number;
  queryText: string;
  onDelete: (display_id: number, stored_id: number) => void;
  onOpen: (stored_id: number) => void;
  isSelected: boolean;
  toMark: (stored_id: number) => void;
  isMarked: boolean;
  onEdit: (stored_id: number, newQueryText: string) => void;
  highlight?: string;
};

const Highlight: React.FC<{ text: string; term?: string }> = ({ text, term }) => {
  if (!term) return <>{text}</>;
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
};

const QueryComponent: React.FC<QueryComponentProps> = ({ display_id, stored_id, queryText, onDelete, onOpen, isSelected, onEdit, toMark, isMarked, highlight }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newQueryText, setNewQueryText] = useState(queryText);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();

  /* Auto-cancel the delete confirmation after a few seconds */
  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setNewQueryText(queryText);
  };

  const handleSave = async () => {
    const title = newQueryText.trim();
    setIsEditing(false);
    if (!title || title === queryText) return;
    onEdit(stored_id, title);
    toast('Conversation renamed');
    try {
      await fetch(`${API_URL}/conversations/${stored_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: title, generate: false }),
      });
    } catch (error) {
      console.error('Rename failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div
      className={`query${isSelected ? ' selected' : ''}${isEditing ? ' editing' : ''}`}
      onClick={() => !isEditing && onOpen(stored_id)}
      role='button'
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' && !isEditing && e.target === e.currentTarget) onOpen(stored_id); }}
    >
      <span className='query-icon'><IconMessage size={15} /></span>
      {isEditing ? (
        <input
          type="text"
          value={newQueryText}
          onChange={e => setNewQueryText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className='queryname-input'
          aria-label='Conversation title'
          autoFocus
        />
      ) : (
        <span className='queryname' title={queryText}>
          <Highlight text={queryText} term={highlight} />
        </span>
      )}

      {isMarked && !isEditing && <span className='star-mark'><IconStar size={13} /></span>}

      {!isEditing && (
        <div className='conv-actions actions' onClick={e => e.stopPropagation()}>
          {confirmDelete ? (
            <>
              <button className='qa-btn danger' aria-label='Confirm delete' data-tip='Delete' onClick={() => { onDelete(display_id, stored_id); toast('Conversation deleted'); }}>
                <IconCheck size={14} />
              </button>
              <button className='qa-btn' aria-label='Cancel delete' data-tip='Cancel' onClick={() => setConfirmDelete(false)}>
                <IconX size={14} />
              </button>
            </>
          ) : (
            <>
              <button className={`qa-btn${isMarked ? ' starred' : ''}`} aria-label={isMarked ? 'Unstar' : 'Star'} data-tip={isMarked ? 'Unstar' : 'Star'} onClick={() => { toMark(stored_id); toast(isMarked ? 'Removed from starred' : 'Added to starred', 'info'); }}>
                <IconStar size={14} />
              </button>
              <button className='qa-btn' aria-label='Rename' data-tip='Rename' onClick={handleEdit}>
                <IconPencil size={14} />
              </button>
              <button className='qa-btn' aria-label='Delete' data-tip='Delete' onClick={() => setConfirmDelete(true)}>
                <IconTrash size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default QueryComponent;
