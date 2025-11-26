import AddNovel from '@/app/components/AddNovel';
import NovelsList from '@/app/components/NovelsList';

export default function Home() {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black py-12 px-4">
            <div className="max-w-6xl mx-auto">
                <header className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
                        Novel Parser
                    </h1>
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Add novels to automatically parse and store their content
                    </p>
                </header>

                <div className="space-y-8">
                    <AddNovel />
                    <NovelsList />
                </div>
            </div>
        </div>
    );
}