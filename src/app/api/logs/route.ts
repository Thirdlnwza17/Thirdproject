import { NextRequest, NextResponse } from 'next/server';
import { 
  createLog,
  updateLog,
  deleteLog,
  getAllLogs,
  getLog,
  getAllLogsFromAll,
  getAuditLogs,
  fetchAllUsers,
  getUserRole,
  getCurrentUser,
  loginUser,
  updateOcrEntry,
  deleteOcrEntry,
  signOutUser,
  type SterilizerEntry
} from '@/dbService';

// Cache for logs with TTL (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: any; timestamp: number }>();

// Helper function to generate cache key from request parameters
function generateCacheKey(url: string): string {
  return url;
}

// Helper function to get cached data or fetch fresh data
async function getCachedData<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await fetchFn();
  cache.set(key, { data, timestamp: now });
  return data;
}


import { collection, getDocs, query, where, limit as limitQuery } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { searchParams } = url;
    const action = searchParams.get('action');
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action parameter is required' },
        { status: 400 }
      );
    }
    
    // New endpoint to search items by name or ID
    if (action === 'search-items') {
      const searchTerm = (searchParams.get('q') || '').trim().toUpperCase();
      const limit = parseInt(searchParams.get('limit') || '5');
      
      if (!searchTerm || searchTerm.length < 2) {
        return NextResponse.json({ items: [] });
      }
      
      const itemsRef = collection(db, 'items');
      
      // Check if search term looks like an ID (alphanumeric, at least 5 chars)
      const isIdSearch = /^[A-Z0-9]{5,}$/.test(searchTerm);
      
      let items: any[] = [];
      
      // If search term is 5 or more characters, try ID search first
      if (isIdSearch) {
        // First try exact match
        const q = query(
          itemsRef,
          where('id', '==', searchTerm),
          limitQuery(1)
        );
        
        const snapshot = await getDocs(q);
        items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // If no exact match, try partial ID match
        if (items.length === 0) {
          const partialIdQuery = query(
            itemsRef,
            where('id', '>=', searchTerm),
            where('id', '<=', searchTerm + '\uf8ff'),
            limitQuery(limit)
          );
          const partialSnapshot = await getDocs(partialIdQuery);
          items = partialSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        }
      }
      
      // If no ID search was performed or no results from ID search, try name search
      if (items.length === 0) {
        const nameQuery = query(
          itemsRef,
          where('name', '>=', searchTerm),
          where('name', '<=', searchTerm + '\uf8ff'),
          limitQuery(limit)
        );
        const nameSnapshot = await getDocs(nameQuery);
        items = nameSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
      
      return NextResponse.json({ items });
    }

    // Check if the request can be cached
    const isCacheable = [
      'get-log', 
      'get-all-logs', 
      'get-audit-logs', 
      'get-all-users',
      'get-user-role',
      'get-current-user'
    ].includes(action);
    
    const cacheKey = isCacheable ? generateCacheKey(request.url) : null;

    // Helper function to handle cached responses
    const handleCachedRequest = async <T>(fetchFn: () => Promise<T>): Promise<T> => {
      if (isCacheable && cacheKey) {
        return getCachedData(cacheKey, fetchFn);
      }
      return fetchFn();
    };
    
    switch (action) {
      case 'get-log': {
        const id = searchParams.get('id');
        const program = searchParams.get('program');
        
        if (!id || !program) {
          return NextResponse.json(
            { error: 'ID and program are required for get-log action' },
            { status: 400 }
          );
        }
        
        const log = await handleCachedRequest(() => getLog(program, id));
        
        if (!log) {
          return NextResponse.json(
            { error: 'Log not found' },
            { status: 404 }
          );
        }
        
        return NextResponse.json({ success: true, data: log });
      }
      
      case 'get-all-logs': {
        // Parse query parameters for pagination and filtering
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100 items per page
        const offset = (page - 1) * limit;
        const program = searchParams.get('program') || undefined;
        const status = searchParams.get('status') || undefined;
        const facility = searchParams.get('facility') || undefined;
        const sterilizer = searchParams.get('sterilizer') || undefined;
        const userId = searchParams.get('userId') || undefined;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sortBy = searchParams.get('sortBy') || 'created_at';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
        const fields = searchParams.get('fields')?.split(',').filter(Boolean) || [];
        const useCache = searchParams.get('cache') !== 'false';

        // Build filters object
        const filters: Record<string, any> = {};
        if (program) filters.program = program;
        if (status) filters.status = status;
        if (facility) filters.facility = facility;
        if (sterilizer) filters.sterilizer = sterilizer;
        if (userId) filters.userId = userId;
        if (startDate && endDate) {
          filters.created_at = {
            '>=': new Date(startDate).toISOString(),
            '<=': new Date(endDate).toISOString()
          };
        }

        const fetchData = async () => {
          if (program) {
            // For single program, use the simpler getAllLogs function
            const logs = await getAllLogs(program);
            // Apply client-side filtering, sorting and pagination since getAllLogs doesn't support these
            let filteredLogs = [...logs];
            
            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined) {
                filteredLogs = filteredLogs.filter(log => 
                  log[key as keyof SterilizerEntry] === value
                );
              }
            });
            
            // Apply sorting with null checks
            filteredLogs.sort((a, b) => {
              const aVal = a[sortBy as keyof SterilizerEntry];
              const bVal = b[sortBy as keyof SterilizerEntry];
              
              // Handle null/undefined cases
              if (aVal === bVal) return 0;
              if (aVal === undefined || aVal === null) return 1;
              if (bVal === undefined || bVal === null) return -1;
              
              // Handle different types
              if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortOrder === 'asc' 
                  ? aVal.localeCompare(bVal)
                  : bVal.localeCompare(aVal);
              }
              
              // Handle numbers and dates
              const aNum = aVal instanceof Date ? aVal.getTime() : Number(aVal);
              const bNum = bVal instanceof Date ? bVal.getTime() : Number(bVal);
              
              return sortOrder === 'asc' 
                ? aNum > bNum ? 1 : -1 
                : aNum < bNum ? 1 : -1;
            });
            
            // Apply pagination
            const total = filteredLogs.length;
            const paginatedLogs = filteredLogs.slice(offset, offset + limit);
            
            // Apply field projection if specified
            const items = fields.length > 0
              ? paginatedLogs.map(log => {
                  const projected: Record<string, any> = { id: log.id };
                  fields.forEach(field => {
                    if (field in log) {
                      projected[field] = log[field as keyof SterilizerEntry];
                    }
                  });
                  return projected;
                })
              : paginatedLogs;
                
            return { 
              items, 
              total, 
              hasMore: offset + items.length < total 
            };
          } else {
            return await getAllLogsFromAll({
              limit,
              offset,
              filters,
              fields,
              orderBy: {
                field: sortBy,
                direction: sortOrder as 'asc' | 'desc'
              }
            });
          }
        };

        const result = useCache 
          ? await handleCachedRequest(fetchData)
          : await fetchData();
          
        return NextResponse.json({
          success: true,
          data: result.items,
          pagination: {
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
            hasMore: result.hasMore
          }
        });
      }
      
      case 'get-audit-logs': {
        const limitCount = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);
        const page = parseInt(searchParams.get('page') || '1');
        const offset = (page - 1) * limitCount;
        const action = searchParams.get('action') || undefined;
        const userId = searchParams.get('userId') || undefined;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        
        // Get all audit logs first (with limit)
        const allLogs = await handleCachedRequest(() => getAuditLogs(1000));
        
        // Apply filters
        let filteredLogs = allLogs;
        
        if (action) {
          filteredLogs = filteredLogs.filter(log => log.action === action);
        }
        if (userId) {
          filteredLogs = filteredLogs.filter(log => log.userId === userId);
        }
        if (startDate && endDate) {
          const start = new Date(startDate).getTime();
          const end = new Date(endDate).getTime();
          filteredLogs = filteredLogs.filter(log => {
            const logTime = log.timestamp.getTime();
            return logTime >= start && logTime <= end;
          });
        }
        
        // Apply pagination
        const total = filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(offset, offset + limitCount);
        
        return NextResponse.json({
          success: true,
          data: paginatedLogs,
          pagination: {
            total,
            page,
            limit: limitCount,
            totalPages: Math.ceil(total / limitCount),
            hasMore: offset + paginatedLogs.length < total
          }
        });
      }
      
      case 'get-all-users': {
        const users = await handleCachedRequest(fetchAllUsers);
        return NextResponse.json({ success: true, data: users });
      }
      
      case 'get-user-role': {
        const uid = searchParams.get('uid');
        if (!uid) {
          return NextResponse.json(
            { error: 'User ID is required' },
            { status: 400 }
          );
        }
        const role = await handleCachedRequest(() => getUserRole(uid));
        return NextResponse.json({ success: true, data: { role } });
      }
      
      case 'get-current-user': {
        const user = getCurrentUser();
        return NextResponse.json({ success: true, data: user });
      }
      
      case 'get-dashboard-metrics': {
        // Get dashboard metrics with pre-aggregated data
        const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = searchParams.get('endDate') || new Date().toISOString();
        const groupBy = searchParams.get('groupBy') || 'program';
        
        // For now, return empty metrics until we implement aggregation
        // In a real implementation, you would call a function that aggregates logs
        const metrics = {
          summary: {
            totalLogs: 0,
            byProgram: {},
            byFacility: {}
          },
          timeSeries: []
        };
        
        // Example of how you might implement this later:
        // const metrics = await getLogsSummary({
        //   startDate: new Date(startDate),
        //   endDate: new Date(endDate),
        //   groupBy
        // });

        return NextResponse.json({ success: true, data: metrics });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in GET request:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, program, data, userId, userEmail, userRole } = await request.json();
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }
    
    // Invalidate relevant caches on write operations
    const invalidateCaches = () => {
      // Clear all caches for now - in a real app, you might want to be more specific
      // Cache is now handled by the cache Map, no need for logsCache
    };
    
    switch (action) {
      case 'create-log': {
        if (!program) {
          return NextResponse.json(
            { error: 'Program is required' },
            { status: 400 }
          );
        }
        
        const logId = await createLog(program, data, userId, userEmail, userRole);
        invalidateCaches();
        
        return NextResponse.json({ 
          success: true, 
          id: logId,
          message: 'Log created successfully'
        });
      }
      
      case 'batch-create-logs': {
        if (!program || !Array.isArray(data)) {
          return NextResponse.json(
            { error: 'Program and an array of log data are required' },
            { status: 400 }
          );
        }
        
        const results = await Promise.all(
          data.map(logData => 
            createLog(program, logData, userId, userEmail, userRole)
              .then(id => ({ success: true, id }))
              .catch(error => ({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error'
              }))
          )
        );
        
        invalidateCaches();
        
        return NextResponse.json({
          success: true,
          results,
          message: `Processed ${results.length} logs`
        });
      }
      
      case 'login': {
        const { email, password, selectedUserData } = await request.json();
        if (!email || !password) {
          return NextResponse.json(
            { error: 'Email and password are required' },
            { status: 400 }
          );
        }
        
        const result = await loginUser(email, password, selectedUserData);
        return NextResponse.json(result);
      }
      
      case 'logout': {
        const result = await signOutUser();
        invalidateCaches(); // Clear caches on logout
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in POST /api/logs:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 500 
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { action, program, id, data, userId, userEmail, userRole } = await request.json();
    
    if (!action || !id) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Action and ID are required',
          status: 400 
        },
        { status: 400 }
      );
    }
    
    // Invalidate caches for write operations
    const invalidateCaches = () => cache.clear();
    
    switch (action) {
      case 'update-log': {
        if (!program) {
          return NextResponse.json(
            { 
              success: false,
              error: 'Program is required for update-log action',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          await updateLog(program, id, data, userId, userEmail, userRole);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'Log updated successfully',
            id,
            program
          });
        } catch (error) {
          console.error('Error updating log:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to update log',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      case 'update-sterilizer-entry': {
        if (!data) {
          return NextResponse.json(
            { 
              success: false,
              error: 'Data is required',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          const program = data.program || 'EO'; // Default to EO if not specified
          await updateLog(program, id, data, userId, userEmail, userRole);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'Sterilizer entry updated successfully',
            id,
            program
          });
        } catch (error) {
          console.error('Error updating sterilizer entry:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to update sterilizer entry',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      case 'update-ocr-entry': {
        if (!data) {
          return NextResponse.json(
            { 
              success: false,
              error: 'Data is required',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          await updateOcrEntry(id, data);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'OCR entry updated successfully',
            id
          });
        } catch (error) {
          console.error('Error updating OCR entry:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to update OCR entry',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      default:
        return NextResponse.json(
          { 
            success: false,
            error: 'Invalid action',
            status: 400 
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in PUT /api/logs:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 500 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');
    const program = searchParams.get('program');
    const userId = searchParams.get('userId') || '';
    const userEmail = searchParams.get('userEmail') || 'system';
    const userRole = searchParams.get('userRole') || 'system';
    
    if (!action) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Action is required',
          status: 400 
        },
        { status: 400 }
      );
    }
    
    // Invalidate caches for delete operations
    const invalidateCaches = () => cache.clear();
    
    switch (action) {
      case 'delete-log': {
        if (!id || !program) {
          return NextResponse.json(
            { 
              success: false,
              error: 'ID and program are required',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          await deleteLog(program, id, userId, userEmail, userRole);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'Log deleted successfully',
            id,
            program
          });
        } catch (error) {
          console.error('Error deleting log:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to delete log',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      case 'delete-sterilizer-entry': {
        if (!id || !program) {
          return NextResponse.json(
            { 
              success: false,
              error: 'ID and program are required',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          await deleteLog(program, id, userId, userEmail, userRole);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'Sterilizer entry deleted successfully',
            id,
            program
          });
        } catch (error) {
          console.error('Error deleting sterilizer entry:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to delete sterilizer entry',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      case 'delete-ocr-entry': {
        if (!id) {
          return NextResponse.json(
            { 
              success: false,
              error: 'ID is required',
              status: 400 
            },
            { status: 400 }
          );
        }
        
        try {
          await deleteOcrEntry(id);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'OCR entry deleted successfully',
            id
          });
        } catch (error) {
          console.error('Error deleting OCR entry:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to delete OCR entry',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      case 'sign-out': {
        try {
          await signOutUser(userId, userEmail, userRole);
          invalidateCaches();
          
          return NextResponse.json({ 
            success: true,
            message: 'Signed out successfully'
          });
        } catch (error) {
          console.error('Error during sign out:', error);
          return NextResponse.json(
            { 
              success: false,
              error: 'Failed to sign out',
              details: error instanceof Error ? error.message : 'Unknown error',
              status: 500 
            },
            { status: 500 }
          );
        }
      }
      
      default:
        return NextResponse.json(
          { 
            success: false,
            error: 'Invalid action',
            status: 400 
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in DELETE /api/logs:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 500 
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
