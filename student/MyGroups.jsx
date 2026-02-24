import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { MessageSquare, Users, Calendar, Loader2, Search, X } from 'lucide-react';
import { getAuth } from 'firebase/auth';
const MyGroups = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allMessages, setAllMessages] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
  const fetchMyGroups = async () => {
  try {
    setLoading(true);
    setError(null);

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      setError('Please log in to view your groups');
      return;
    }

    // Force refresh token
    const freshToken = await user.getIdToken(true);
    console.log('[MyGroups] Fresh token generated');

    const res = await api.get('/api/admingroups/my-groups', {
      headers: {
        Authorization: `Bearer ${freshToken}`
      }
    });

    console.log('[MyGroups] Success - status:', res.status);
    console.log('[MyGroups] Groups data:', res.data);

    setGroups(res.data || []);
  } catch (err) {
    console.error('Failed to load groups:', err);

    let msg = 'Could not load your groups.';

    if (err.response?.status === 401) {
      msg = 'Your session has expired. Please log out and log in again.';
      // Optional: auto-logout or redirect
      // auth.signOut().then(() => navigate('/login'));
    } else if (err.response?.status === 403) {
      msg = 'You do not have permission to view groups.';
    } else if (err.message.includes('network')) {
      msg = 'Network error – please check your connection.';
    }

    setError(msg);
  } finally {
    setLoading(false);
  }
};

    fetchMyGroups();
  }, []);

  // Fetch all messages from all groups
  const fetchAllMessages = async () => {
    try {
      setSearchLoading(true);
      const groupMessages = [];
      
      for (const group of groups) {
        try {
          const res = await api.get(`/api/admingroups/${group.group_id}/messages`);
          const messagesWithGroup = res.data.map(m => ({
            ...m,
            group_id: group.group_id,
            group_name: group.name,
          }));
          groupMessages.push(...messagesWithGroup);
        } catch (err) {
          console.error(`Failed to load messages for group ${group.group_id}:`, err);
        }
      }
      
      setAllMessages(groupMessages);
      setShowSearch(true);
    } catch (err) {
      console.error('Failed to fetch all messages:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Search messages when query changes
  useEffect(() => {
    if (searchQuery.trim() && allMessages.length > 0) {
      const results = allMessages.filter(msg =>
        msg.text?.toLowerCase().includes(searchQuery.toLowerCase())
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, allMessages]);

  // Fetch all messages when search is opened
  useEffect(() => {
    if (showSearch && allMessages.length === 0 && groups.length > 0) {
      fetchAllMessages();
    }
  }, [showSearch, groups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 px-4 text-red-600">
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">
          No Groups Yet
        </h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Your admin hasn't added you to any group yet. Check back later or contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Groups</h1>
          <span className="text-sm text-gray-500">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </span>
        </div>

        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search messages in your groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearch(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearch && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
              {searchLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No messages found
                </div>
              ) : (
                <div className="border-t">
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        navigate(`/student/groups/${result.group_id}`);
                      }}
                      className="p-4 border-b cursor-pointer hover:bg-orange-50 transition-colors last:border-b-0"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="font-semibold text-gray-900 text-sm">{result.group_name}</div>
                        <div className="text-gray-600 text-sm line-clamp-2">{result.text || '(No text)'}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(result.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!showSearch && searchQuery.trim() ? null : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <div
            key={group.group_id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                      {group.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Calendar size={14} />
                  {new Date(group.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 text-sm text-gray-600">
                <Users size={16} />
                <span>{group.member_count || '...' } members</span>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between">
              <Link
                to={`/student/groups/${group.group_id}`}
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
              >
                <MessageSquare size={16} />
                Open Chat
              </Link>

              {group.unread_count > 0 && (
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {group.unread_count} new
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};

export default MyGroups;