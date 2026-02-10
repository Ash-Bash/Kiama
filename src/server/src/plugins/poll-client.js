// Poll Client Plugin - Served by server for download
// This file is downloaded and executed by clients to handle poll messages

const pollClientPlugin = {
  name: 'Poll Renderer',
  version: '1.0.0',
  messageTypes: ['poll'],

  init: (api) => {
    // Register the poll message component
    const PollComponent = ({ message }) => {
      // Simple poll component that returns JSX-like structure
      // In a real implementation, this would be a proper React component
      return {
        type: 'div',
        props: {
          className: 'poll-message',
          children: [
            {
              type: 'h3',
              props: { children: message.data.question }
            },
            {
              type: 'div',
              props: {
                className: 'poll-options',
                children: message.data.options.map((option, index) => ({
                  type: 'button',
                  props: {
                    key: index,
                    className: 'poll-option-button',
                    children: option,
                    onClick: () => console.log(`Voted for: ${option}`)
                  }
                }))
              }
            }
          ]
        }
      };
    };

    api.registerMessageType('poll', PollComponent);

    console.log('Poll client plugin initialized');
  }
};

// Export the plugin
export default pollClientPlugin;