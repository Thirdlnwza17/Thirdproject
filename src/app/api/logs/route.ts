import { NextRequest, NextResponse } from 'next/server';
import { 
  createLog,
  updateLog,
  deleteLog,
  getAllLogs,
  getLog,
  getAllLogsFromAll,
  updateSterilizerEntry,
  deleteSterilizerEntry,
  addOcrEntry,
  updateOcrEntry,
  deleteOcrEntry,
  fetchAllUsers,
  getUserRole,
  loginUser,
  getCurrentUser,
  signOutUser,
  getAuditLogs
} from '@/dbService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
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
        const log = await getLog(program, id);
        if (!log) {
          return NextResponse.json(
            { error: 'Log not found' },
            { status: 404 }
          );
        }
        return NextResponse.json(log);
      }
      
      case 'get-all-logs': {
        const program = searchParams.get('program');
        const logs = program ? await getAllLogs(program) : await getAllLogsFromAll();
        return NextResponse.json(logs);
      }
      
      case 'get-audit-logs': {
        const limitCount = parseInt(searchParams.get('limit') || '100', 10);
        const logs = await getAuditLogs(limitCount);
        return NextResponse.json(logs);
      }
      
      case 'get-all-users': {
        const users = await fetchAllUsers();
        return NextResponse.json(users);
      }
      
      case 'get-user-role': {
        const uid = searchParams.get('uid');
        if (!uid) {
          return NextResponse.json(
            { error: 'User ID is required' },
            { status: 400 }
          );
        }
        const role = await getUserRole(uid);
        return NextResponse.json({ role });
      }
      
      case 'get-current-user': {
        const user = getCurrentUser();
        return NextResponse.json(user);
      }
      
     
      
      default:
        return NextResponse.json(
          { error: 'Invalid or missing action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in GET request:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, ...payload } = await request.json();
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'create-log': {
        const { program, data, userId, userEmail, userRole } = payload;
        if (!program || !data) {
          return NextResponse.json(
            { error: 'Program and data are required' },
            { status: 400 }
          );
        }
        const logId = await createLog(program, data, userId, userEmail, userRole);
        return NextResponse.json({ id: logId, ...data }, { status: 201 });
      }
      
        case 'add-ocr-entry': {
        const { data } = payload;
        if (!data) {
          return NextResponse.json(
            { error: 'Data is required' },
            { status: 400 }
          );
        }
        const docRef = await addOcrEntry(data);
        return NextResponse.json({ id: docRef.id, ...data }, { status: 201 });
      }
      
      case 'login': {
        const { email, password, selectedUserData } = payload;
        if (!email || !password) {
          return NextResponse.json(
            { error: 'Email and password are required' },
            { status: 400 }
          );
        }
        const result = await loginUser(email, password, selectedUserData);
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in POST request:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { action, ...payload } = await request.json();
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'update-log': {
        const { program, id, data, userId, userEmail, userRole } = payload;
        if (!program || !id || !data) {
          return NextResponse.json(
            { error: 'Program, id, and data are required' },
            { status: 400 }
          );
        }
        await updateLog(program, id, data, userId, userEmail, userRole);
        return NextResponse.json({ success: true });
      }
      
      case 'update-sterilizer-entry': {
        const { id, data } = payload;
        if (!id || !data) {
          return NextResponse.json(
            { error: 'ID and data are required' },
            { status: 400 }
          );
        }
        await updateSterilizerEntry(id, data);
        return NextResponse.json({ success: true });
      }
      
      case 'update-ocr-entry': {
        const { id, data } = payload;
        if (!id || !data) {
          return NextResponse.json(
            { error: 'ID and data are required' },
            { status: 400 }
          );
        }
        await updateOcrEntry(id, data);
        return NextResponse.json({ success: true });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in PUT request:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'delete-log': {
        const program = searchParams.get('program');
        const id = searchParams.get('id');
        const userId = searchParams.get('userId') || '';
        const userEmail = searchParams.get('userEmail') || 'system';
        const userRole = searchParams.get('userRole') || 'system';
        
        if (!program || !id) {
          return NextResponse.json(
            { error: 'Program and id are required' },
            { status: 400 }
          );
        }
        
        await deleteLog(program, id, userId, userEmail, userRole);
        return NextResponse.json({ success: true });
      }
      
      case 'delete-sterilizer-entry': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json(
            { error: 'ID is required' },
            { status: 400 }
          );
        }
        await deleteSterilizerEntry(id);
        return NextResponse.json({ success: true });
      }
      
      case 'delete-ocr-entry': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json(
            { error: 'ID is required' },
            { status: 400 }
          );
        }
        await deleteOcrEntry(id);
        return NextResponse.json({ success: true });
      }
      
      case 'sign-out': {
        const userId = searchParams.get('userId') || '';
        const userEmail = searchParams.get('userEmail') || 'system';
        const userRole = searchParams.get('userRole') || 'system';
        
        await signOutUser(userId, userEmail, userRole);
        return NextResponse.json({ success: true });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in DELETE request:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
