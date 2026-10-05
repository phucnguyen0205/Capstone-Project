/**
 * ICE servers configuration for WebRTC
 * Supports STUN/TURN servers from multiple providers
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Get ICE servers configuration
 */
export async function getIceServers(): Promise<IceServer[]> {
  const servers: IceServer[] = [];

  // Always include Google STUN servers
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  );

  // Static TURN server
  if (process.env.TURN_SERVER_URL) {
    servers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  // Xirsys (recommended for production)
  if (process.env.XIRSYS_IDENT && process.env.XIRSYS_SECRET) {
    try {
      const xirsysServers = await getXirsysIceServers(
        process.env.XIRSYS_IDENT,
        process.env.XIRSYS_SECRET,
        process.env.XIRSYS_CHANNEL || 'default'
      );
      servers.push(...xirsysServers);
    } catch (error) {
      console.error('[ICE] Failed to get Xirsys servers:', error);
    }
  }

  // Twilio Network Traversal
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilioServers = await getTwilioIceServers(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      servers.push(...twilioServers);
    } catch (error) {
      console.error('[ICE] Failed to get Twilio servers:', error);
    }
  }

  return servers;
}

/**
 * Get ICE servers from Xirsys
 */
async function getXirsysIceServers(
  ident: string,
  secret: string,
  channel: string
): Promise<IceServer[]> {
  const response = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${Buffer.from(`${ident}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Xirsys API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.v && data.v.iceServers) {
    return data.v.iceServers;
  }

  throw new Error('Invalid Xirsys response');
}

/**
 * Get ICE servers from Twilio
 */
async function getTwilioIceServers(
  accountSid: string,
  authToken: string
): Promise<IceServer[]> {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.ice_servers) {
    return data.ice_servers.map((server: any) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential,
    }));
  }

  throw new Error('Invalid Twilio response');
}
