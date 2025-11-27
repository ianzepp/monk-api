import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/user/profile - Get authenticated user's profile
 *
 * Self-service endpoint - any authenticated user can view their own profile.
 * Does not require sudo access.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "name": "John Doe",
 *     "auth": "john@example.com",
 *     "access": "full",
 *     "access_read": ["uuid1", "uuid2"],
 *     "access_edit": ["uuid3"],
 *     "access_full": ["uuid4"],
 *     "created_at": "2025-01-15T10:30:00Z",
 *     "updated_at": "2025-01-15T10:30:00Z"
 *   }
 * }
 */
export default withTransaction(async ({ system }) => {
    const user = system.getUser();

    // Fetch full user profile from database
    const profile = await system.database.select404(
        'users',
        { where: { id: user.id } },
        'User profile not found'
    );

    return profile;
});
