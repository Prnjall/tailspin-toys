import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllCategories,
    getAllGameIds,
    getAllPublishers,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<{ categoryId: number; publisherId: number }> {
    const [{ id: categoryId }] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [{ id: publisherId }] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId,
            publisherId,
        });
    }

    return { categoryId, publisherId };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns filter options ordered by name', async () => {
        const { categoryId, publisherId } = await seedGames(db, 1);
        await db.insert(categories).values({ name: 'Adventure', description: 'cat' });
        await db.insert(publishers).values({ name: 'Acme Games', description: 'pub' });

        expect(await getAllCategories(db)).toEqual([
            { id: expect.any(Number), name: 'Adventure' },
            { id: categoryId, name: 'Strategy' },
        ]);
        expect(await getAllPublishers(db)).toEqual([
            { id: expect.any(Number), name: 'Acme Games' },
            { id: publisherId, name: 'Pub One' },
        ]);
    });

    it('filters games by category and publisher together', async () => {
        const { categoryId, publisherId } = await seedGames(db, 1);
        const [{ id: otherCategoryId }] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'cat' })
            .returning({ id: categories.id });
        const [{ id: otherPublisherId }] = await db
            .insert(publishers)
            .values({ name: 'Acme Games', description: 'pub' })
            .returning({ id: publishers.id });
        await db.insert(games).values([
            {
                title: 'Other Category',
                description: 'Description',
                starRating: 4,
                categoryId: otherCategoryId,
                publisherId,
            },
            {
                title: 'Other Publisher',
                description: 'Description',
                starRating: 4,
                categoryId,
                publisherId: otherPublisherId,
            },
        ]);

        const filtered = await getAllGames(db, { categoryIds: [categoryId], publisherId });
        expect(filtered.map((game) => game.title)).toEqual(['Game 01']);
    });

    it('matches any selected category and preserves title ordering', async () => {
        const { categoryId, publisherId } = await seedGames(db, 1);
        const [{ id: otherCategoryId }] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'cat' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'A Different Category',
            description: 'Description',
            starRating: 4,
            categoryId: otherCategoryId,
            publisherId,
        });

        const filtered = await getAllGames(db, { categoryIds: [categoryId, otherCategoryId] });
        expect(filtered.map((game) => game.title)).toEqual(['A Different Category', 'Game 01']);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
