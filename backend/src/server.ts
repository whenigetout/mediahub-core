// src/server.ts
import fastify from 'fastify';

const app = fastify();

app.get('/api/health', async () => {
    return { status: 'healthy' };
});

const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen({ port: PORT }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is running on port ${PORT}`);
});