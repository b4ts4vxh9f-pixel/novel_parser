'use client';

import { useState, useEffect } from 'react';
import { generateEpub } from './epubGenerator.js';
import { cleanNovelChapters } from '../../../scripts/cleaners/ChapterCleaning.js'; // Import the new action
import { cleaningMethod } from './cleaningMethod.js'; // Import constants

const STATUS_LABELS = {
    0: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' },
    1: { label: 'Success', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
    2: { label: 'Processing', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
    '-1': { label: 'Error', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' }
};

export default function NovelsList() {
    const [novels, setNovels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [downloadingId, setDownloadingId] = useState(null);

    // New State for Cleaning UI
    const [cleaningId, setCleaningId] = useState(null); // Which novel is currently running cleaning
    const [showCleanModal, setShowCleanModal] = useState(null); // ID of novel to show modal for
    const [selectedMethod, setSelectedMethod] = useState(cleaningMethod.LotV);

    const fetchNovels = async () => {
        try {
            setError(null);
            const url = filter === 'all'
                ? '/api/novels'
                : `/api/novels?status=${filter}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (data.success) {
                setNovels(data.novels);
            } else {
                throw new Error(data.error || 'Failed to fetch novels');
            }
        } catch (error) {
            console.error('Error fetching novels:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadEpub = async (novelId, novelTitle) => {
        setDownloadingId(novelId);
        try {
            const result = await generateEpub(novelId);
            if (!result.success) throw new Error(result.error || 'Failed to generate EPUB.');

            const { publicUrl, filename } = result;
            const a = document.createElement('a');
            a.href = publicUrl;
            a.download = filename || `${novelTitle}.epub`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error) {
            alert(`Failed to download EPUB: ${error.message}`);
        } finally {
            setDownloadingId(null);
        }
    };

    // --- NEW: Cleaning Handler ---
    const handleCleanChapters = async (novelId) => {
        setCleaningId(novelId);
        setShowCleanModal(null); // Close modal
        try {
            const result = await cleanNovelChapters(novelId, selectedMethod);
            if (result.success) {
                alert(result.message);
                fetchNovels(); // Refresh data (e.g. updated_at timestamp)
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            alert(`Cleaning failed: ${e.message}`);
        } finally {
            setCleaningId(null);
        }
    };

    useEffect(() => {
        fetchNovels();
        const interval = setInterval(fetchNovels, 10000);
        return () => clearInterval(interval);
    }, [filter]);

    if (loading) {
        return (
            <div className="flex justify-center items-center p-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full max-w-4xl mx-auto p-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-300">Error loading novels: {error}</p>
                    <button onClick={fetchNovels} className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline">Try again</button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto p-6">
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Novels ({novels.length})</h2>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">All Status</option>
                        <option value="0">Pending</option>
                        <option value="2">Processing</option>
                        <option value="1">Success</option>
                        <option value="-1">Error</option>
                    </select>
                </div>

                {novels.length === 0 ? (
                    <p className="text-center text-zinc-500 dark:text-zinc-400 py-8">No novels found. Add one to get started!</p>
                ) : (
                    <div className="space-y-4">
                        {novels.map((novel) => (
                            <div key={novel.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">{novel.title || 'Untitled'}</h3>
                                        {novel.author && <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">by {novel.author}</p>}
                                        <p className="text-sm text-zinc-500 dark:text-zinc-500 truncate">{novel.url}</p>
                                        {novel.total_chapters > 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">📚 {novel.total_chapters} chapters</p>}
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_LABELS[novel.status]?.color || STATUS_LABELS[0].color}`}>
                                            {STATUS_LABELS[novel.status]?.label || 'Unknown'}
                                        </span>

                                        {/* Action Buttons Row */}
                                        <div className="flex gap-2 mt-2">
                                            {/* CLEAN BUTTON */}
                                            {novel.total_chapters > 0 && (
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowCleanModal(showCleanModal === novel.id ? null : novel.id)}
                                                        disabled={cleaningId === novel.id}
                                                        className="px-3 py-1 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-lg transition-colors flex items-center gap-1"
                                                    >
                                                        {cleaningId === novel.id ? (
                                                            <div className="animate-spin h-3 w-3 border-2 border-zinc-500 border-t-transparent rounded-full" />
                                                        ) : (
                                                            <span>🧹 Clean</span>
                                                        )}
                                                    </button>

                                                    {/* Clean Options Modal / Popover */}
                                                    {showCleanModal === novel.id && (
                                                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg shadow-xl z-10 p-3">
                                                            <p className="text-xs font-semibold mb-2 text-zinc-700 dark:text-zinc-300">Select Method:</p>
                                                            <select
                                                                className="w-full mb-3 px-2 py-1 text-sm border rounded dark:bg-zinc-900 dark:border-zinc-600"
                                                                value={selectedMethod}
                                                                onChange={(e) => setSelectedMethod(Number(e.target.value))}
                                                            >
                                                                <option value={cleaningMethod.LotV}>LotV</option>
                                                                <option value={cleaningMethod.CG}>CG</option>
                                                            </select>
                                                            <button
                                                                onClick={() => handleCleanChapters(novel.id)}
                                                                className="w-full py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                                            >
                                                                Run Cleaner
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* DOWNLOAD BUTTON */}
                                            {novel.status === 1 && novel.total_chapters > 0 && (
                                                <button
                                                    onClick={() => handleDownloadEpub(novel.id, novel.title)}
                                                    disabled={downloadingId === novel.id}
                                                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    {downloadingId === novel.id ? (
                                                        <>
                                                            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                                            Gen...
                                                        </>
                                                    ) : (
                                                        <>📖 EPUB</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}