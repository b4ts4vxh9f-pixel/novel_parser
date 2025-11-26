'use client';

import { useState } from 'react';

export default function AddNovel() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!url.trim()) {
            setMessage({ type: 'error', text: 'Please enter a URL' });
            return;
        }

        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const response = await fetch('/api/novels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url.trim() })
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({
                    type: 'success',
                    text: `Novel added successfully! ID: ${data.novelId}`
                });
                setUrl('');
            } else {
                setMessage({
                    type: 'error',
                    text: data.error || 'Failed to add novel'
                });
            }
        } catch (error) {
            console.error('Error:', error);
            setMessage({
                type: 'error',
                text: 'Network error. Please try again.'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6">
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8">
                <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-zinc-50">
                    Add New Novel
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="url"
                            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                        >
                            Novel URL
                        </label>
                        <input
                            type="url"
                            id="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/novel/title"
                            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                            disabled={loading}
                            required
                        />
                    </div>

                    {message.text && (
                        <div
                            className={`p-4 rounded-lg ${
                                message.type === 'success'
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                            }`}
                        >
                            <p className="text-sm font-medium">{message.text}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                Adding Novel...
                            </span>
                        ) : (
                            'Add Novel'
                        )}
                    </button>
                </form>

                <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                        ℹ️ Instructions
                    </h3>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                        <li>Enter the full URL of the novel&apos;s main page</li>
                        <li>The URL must be unique (duplicates will be rejected)</li>
                        <li>The novel will be queued for parsing automatically</li>
                        <li>Check the novels list to see parsing status</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}