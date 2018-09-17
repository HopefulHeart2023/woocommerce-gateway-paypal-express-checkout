/* global wc_ppec_context */
;( function ( $, window, document ) {
	'use strict';

	var showError = function( errorMessage ) {
		var $checkout_form = $( 'form.checkout' );

		// Adapted from https://github.com/woocommerce/woocommerce/blob/ea9aa8cd59c9fa735460abf0ebcb97fa18f80d03/assets/js/frontend/checkout.js#L514-L529
		$( '.woocommerce-NoticeGroup-checkout, .woocommerce-error, .woocommerce-message' ).remove();
		$checkout_form.prepend( '<div class="woocommerce-NoticeGroup woocommerce-NoticeGroup-checkout">' + errorMessage + '</div>' );
		$checkout_form.find( '.input-text, select, input:checkbox' ).trigger( 'validate' ).blur();
		
		var scrollElement = $( '.woocommerce-NoticeGroup-checkout' );
		if ( ! scrollElement.length ) {
			scrollElement = $checkout_form;
		}
		$.scroll_to_notices( scrollElement );
		
		$( document.body ).trigger( 'checkout_error' );
	}

	// Map funding method settings to enumerated options provided by PayPal.
	var getFundingMethods = function( methods ) {
		if ( ! methods ) {
			return null;
		}

		var paypal_funding_methods = [];
		for ( var i = 0; i < methods.length; i++ ) {
			var method = paypal.FUNDING[ methods[ i ] ];
			if ( method ) {
				paypal_funding_methods.push( method );
			}
		}
		return paypal_funding_methods;
	}

	var render = function( isMiniCart ) {
		var prefix        = isMiniCart ? 'mini_cart_' : '';
		var button_size   = wc_ppec_context[ prefix + 'button_size' ];
		var button_layout = wc_ppec_context[ prefix + 'button_layout' ];
		var button_label  = wc_ppec_context[ prefix + 'button_label' ];
		var allowed       = wc_ppec_context[ prefix + 'allowed_methods' ];
		var disallowed    = wc_ppec_context[ prefix + 'disallowed_methods' ];

		var selector = isMiniCart ? '#woo_pp_ec_button_mini_cart' : '#woo_pp_ec_button_' + wc_ppec_context.page;

		paypal.Button.render( {
			env: wc_ppec_context.environment,
			locale: wc_ppec_context.locale,
			commit: 'checkout' === wc_ppec_context.page && ! isMiniCart,

			funding: {
				allowed: getFundingMethods( allowed ),
				disallowed: getFundingMethods( disallowed ),
			},

			style: {
				color: wc_ppec_context.button_color,
				shape: wc_ppec_context.button_shape,
				layout: button_layout,
				size: button_size,
				label: button_label,
				branding: true,
				tagline: false,
			},

			validate: function( actions ) {
				// Only enable on variable product page if purchasable variation selected.
				$( '#woo_pp_ec_button_product' ).off( '.legacy' )
					.on( 'enable', actions.enable )
					.on( 'disable', actions.disable );
			},

			payment: function() {
				// Clear any errors from previous attempt.
				$( '.woocommerce-error', selector ).remove();

				return new paypal.Promise( function( resolve, reject ) {
					// First, generate cart if triggered from single product.
					if ( 'product' === wc_ppec_context.page && ! isMiniCart ) {
						window.wc_ppec_generate_cart( resolve );
					} else {
						resolve();
					}
				} ).then( function() {
					// Make PayPal Checkout initialization request.
					var data = $( selector ).closest( 'form' )
						.add( $( '<input type="hidden" name="nonce" /> ' )
							.attr( 'value', wc_ppec_context.start_checkout_nonce )
						)
						.add( $( '<input type="hidden" name="from_checkout" /> ' )
							.attr( 'value', 'checkout' === wc_ppec_context.page && ! isMiniCart ? 'yes' : 'no' )
						)
						.serialize();

					return paypal.request( {
						method: 'post',
						url: wc_ppec_context.start_checkout_url,
						body: data,
					} ).then( function( response ) {
						if ( ! response.success ) {
							var messageItems = response.data.messages.map( function( message ) {
								return '<li>' + message + '</li>';
							} ).join( '' );

							showError( '<ul class="woocommerce-error" role="alert">' + messageItems + '</ul>' );
							return null;
						}
						return response.data.token;
					} );
				} );
			},

			onAuthorize: function( data, actions ) {
				if ( 'checkout' === wc_ppec_context.page && ! isMiniCart ) {
					// Pass data necessary for authorizing payment to back-end.
					$( 'form.checkout' )
						.append( $( '<input type="hidden" name="paymentToken" /> ' ).attr( 'value', data.paymentToken ) )
						.append( $( '<input type="hidden" name="payerID" /> ' ).attr( 'value', data.payerID ) )
						.submit();
				} else {
					// Navigate to order confirmation URL specified in original request to PayPal from back-end.
					return actions.redirect();
				}
			},

		}, selector );
	};

	// Render cart, single product, or checkout buttons.
	if ( wc_ppec_context.page ) {
		render();
		$( document.body ).on( 'updated_cart_totals updated_checkout', render.bind( this, false ) );
	}

	// Render buttons in mini-cart if present.
	$( document.body ).on( 'wc_fragments_loaded wc_fragments_refreshed', function() {
		var $button = $( '.widget_shopping_cart #woo_pp_ec_button_mini_cart' );
		if ( $button.length ) {
			// Clear any existing button in container, and render.
			$button.empty();
			render( true );
		}
	} );

} )( jQuery, window, document );
