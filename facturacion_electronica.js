//Facturacion electronica By Jeyner
const request = require("request");
const fs = require("fs");
const https = require("https");
const Odoo = require('odoo-xmlrpc');
const util = require('util');
const setTimeoutPromise = util.promisify(setTimeout);

//Odoo Params
const params = require('./params.json');
const odoo = new Odoo(params.odoo_connection);

//Company Params
let NIT = params.company_id
let testing = false

//Electronic Invoice Provider
let token_provider_url = ""
let invoice_provider_url = ""
let note_provider_url = ""
let attachments_provider_url = ""
let getdocument_privider_url = ""
if(testing) {
	token_provider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/login"
	invoice_provider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/InsertInvoice"
	note_provider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/insertnote"
	attachments_provider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/InsertAttachment"
	getdocument_privider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/GetDocumentStatus"
	attachments_invoice_provider_url = "https://misfacturas.cenet.ws/integrationAPI_2/api/AttachRG"
} else {
	token_provider_url = "https://misfacturas.com.co/integrationAPI_2/api/login"
	invoice_provider_url = "https://misfacturas.com.co/integrationAPI_2/api/InsertInvoice"
	note_provider_url = "https://misfacturas.com.co/integrationAPI_2/api/insertnote"
	attachments_provider_url = "https://misfacturas.com.co/integrationAPI_2/api/InsertAttachment"
	getdocument_privider_url = "https://misfacturas.com.co/integrationAPI_2/api/GetDocumentStatus"
	attachments_invoice_provider_url = "https://misfacturas.com.co/integrationAPI_2/api/AttachRG"
}


let payment_metohd_pdf_id = false
let token = false
let token_last_update = false
console.log(params.provider_data,params.provider_data.user)
let privider_user = params.provider_data.user
let provider_pass = params.provider_data.password

function formatDate(date) {
  var d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

  if (month.length < 2) 
      month = '0' + month;
  if (day.length < 2) 
      day = '0' + day;

  return [year, month, day].join('-');
}

Date.prototype.addDays = function(days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}


function odooRequest(pOdoo,pModel,action,params,callback) {
    pOdoo.connect(function (pError) {
        if (pError) { 
            console.log(pError); 
            callback({status:false}); 
        }else{
            pOdoo.execute_kw(pModel, action, params, function (pError, result) {
                if (pError) {
                    console.log(pError)
                    callback({status: false, message: pError})
                } else {
                    callback({status: true, data: result})
                }
            });
        }
    });
}



function getOdooData(pOdoo, pModel, pFilter, pFields, callback) {
	var inParams, params;
	const action = 'search_read'
	inParams = [];
	inParams.push(pFilter);
	inParams.push(pFields);
	inParams.push(0);
	params = [];
	params.push(inParams);
	
	odooRequest(pOdoo,pModel,action,params,res => {
		callback(res)
	})
}



function setOdooData(pOdoo, pModel, pIDs, pData, callback) {
	const action = 'write'
	var inParams, params;
	inParams = [];
	inParams.push(pIDs);
	inParams.push(pData);
	params = [];
	params.push(inParams);
	odooRequest(pOdoo,pModel,action,params,res => {
		callback(res)
	})
}


function updatePartnerToken(callback) {
    request.post({
        headers: {'content-type': 'application/json'},
		url: token_provider_url,
		qs: { username: privider_user, password: provider_pass },
    }, function(error, response, body){
		if(error) {
			console.log(error)
			callback(false)
		} else {
			token_last_update = new Date()
			token = body.slice(1,body.length - 1)
			callback(true)
		}
		console.log("Token updated")
    });
}



function uploadPaymentMethodPDF(callback) {
	if(!token) {
		console.log("Cant update file, NO token.")
		return
	}
	var options = { method: 'POST',
	url: attachments_provider_url,
	qs: { SchemaID: '31', IDNumber: NIT },
	headers: { 
		Authorization: 'misfacturas '+token,
		'content-type': 'multipart/form-data' },
		formData: { 
			File: { 
				value: fs.createReadStream("./attachments/medios.pdf"),
				options: { 
					filename: 'MEDIOS DE PAGO ITELKOM.pdf',
					contentType: null 
				} 
			} 
		} 
	};
	request(options, function (error, response, body) {
		if (error) console.log(error)
		const json = JSON.parse(body)
		if(json && json.FileMailBoxList && json.FileMailBoxList.length > 0) {
			payment_metohd_pdf_id = json.FileMailBoxList[0].FileMailBoxUUID
			callback(true)
			return
		}
		callback(false)
	});
}

function downloadInvoicePDF(inv) {
	let pdf_url = "https://erp.itelkom.co/en/my/invoices/"+inv.id+"?access_token="+inv.access_token+"&report_type=pdf"
	const file = fs.createWriteStream("./attachments/"+inv.name+".pdf");
	https.get(pdf_url, function(response) {
	  response.pipe(file);
	  console.log("PDF Factura almacenado: "+inv.name)
	}); 
}

function uploadInvoicePDF(inv,callback) {
	var options = { method: 'POST',
	url: attachments_invoice_provider_url,
	qs: { SchemaID: '31', IDNumber: NIT, DocumentID: inv.x_documentid, DocumentType: 1 },
	headers: { 
		Authorization: 'misfacturas '+token,
		'content-type': 'multipart/form-data' },
		formData: { 
			file: fs.createReadStream("./attachments/"+inv.name+".pdf"),
			filetype: 'pdf',
			filename: inv.name+".pdf"
		} 
	};
	request(options, function (error, response, body) {
		if (error || !response) {
			console.log(error)
			console.log("Error al subir PDF."+inv.name)
			callback(false)
			return
		}
		if(response.statusCode != 200)
			console.log(response.statusCode,body)
		callback(response.statusCode)
	}); 

}

function sendInvoiceToProvider(data, callback) {
	if(!token) {
		console.log("Cant update file, NO token.")
		return
	}
	var options = { 
		method: 'POST',
		url: invoice_provider_url,
		qs: { SchemaID: '31', IDNumber: NIT, TemplateID: '73'},
		headers: { 
			Authorization: 'misfacturas '+token,
			'Content-Type': 'application/json'
		},
		body: data,
		json: true
	}
	request(options, function (error, response, body) {
		if (error) console.log("ERROR => "+error)
		callback({status: response.statusCode, data: body})
	});
}

function getDocumentStatus(DocumentId, callback) {
	if(!token) {
		console.log("Cant update file, NO token.")
		return
	}
	var options = { 
		method: 'POST',
		url: getdocument_privider_url,
		qs: { SchemaID: '31', IDNumber: NIT, TemplateID: '73', DocumentType: '1', DocumentId: DocumentId},
		headers: { 
			Authorization: 'misfacturas '+token,
			'Content-Type': 'application/json'
		},
		json: true
	}
	request(options, function (error, response, body) {
		if (error) console.log("ERROR => "+error)
		callback({status: response.statusCode, data: body})
	});
}



function getIdentificationType(identificationType) {
	switch(identificationType) {
		case 'rut': return 31
		case 'id_document': return 13
		case 'id_card': return 12
		case 'passport': return 41
		case 'foreign_id_card': return 22
		case 'external_id': return 50
		case 'civil_registration': return 11
		default: return false
	}
}


function jsonInvoiceData(invoice_id, identificationType, identification, dv, clientName, countryCode, countryName, stateCode, stateName, cityCode, cityName, address, 
	phone, email, fiscalPosition, clientType, resolutionNumber, invoiceNumber, invoice_date, currency, comment, exchangeRate, items_data, tax_data) {
	const identType = getIdentificationType(identificationType)
	let ItemInformation = []
	let InvoiceTaxTotal = []
	let InvoiceAllowanceCharge = []
	let totalLineExtensionamount = 0
	let TaxExclusiveAmount = 0
	let TaxInclusiveAmount = 0
	let AllowanceTotalAmount = 0
	let ChargeTotalAmount = 0
	for(let i=0; i < items_data.length; i++) {
		if(items_data[i].product_id == false) continue;
		let TaxesInformation = []
		let AllowanceCharge = []
		let LineTotalTaxes = 0
		let LineAllowanceTotal = 0
		let LineChargeTotal = 0
		let base_grabable = items_data[i].price_unit * items_data[i].quantity
		TaxExclusiveAmount += base_grabable
		for(let j = 0; j < items_data[i].tax_ids.length; j++) {
			let tx = tax_data.find(t => t.id == items_data[i].tax_ids[j])
			if(tx && tx.x_studio_codigo_tipo_impuesto_dian) {
				if(tx.x_studio_tipo == 'Impuesto' || tx.x_studio_tipo == 'Retencion') {
					LineTotalTaxes += (base_grabable * tx.amount) / 100
					TaxesInformation.push({
						Id: tx.x_studio_codigo_tipo_impuesto_dian,
						TaxEvidenceIndicator: (tx.amount < 0 ?true:false),
						TaxableAmount: base_grabable,
						TaxAmount: (base_grabable * Math.abs(tx.amount)) / 100,
						Percent: Math.abs(tx.amount),
						BaseUnitMeasure: 0,
						PerUnitAmount: 0
					})
					const it = InvoiceTaxTotal.findIndex(it => it.Id == tx.x_studio_codigo_tipo_impuesto_dian && it.Percent == Math.abs(tx.amount))
					if(it == -1) {
						InvoiceTaxTotal.push({
							Id: tx.x_studio_codigo_tipo_impuesto_dian,
							TaxEvidenceIndicator: (tx.amount < 0 ?true:false),
							TaxableAmount: base_grabable,
							TaxAmount: (base_grabable * Math.abs(tx.amount)) / 100,
							Percent: Math.abs(tx.amount),
							BaseUnitMeasure: 0,
							PerUnitAmount: 0
						})
					} else {
						InvoiceTaxTotal[it].TaxableAmount += base_grabable
						InvoiceTaxTotal[it].TaxAmount += (base_grabable * Math.abs(tx.amount)) / 100
					}
					
				} else {
					if(tx.amount > 0)
						LineChargeTotal += (base_grabable * Math.abs(tx.amount)) / 100
					else
						LineAllowanceTotal += (base_grabable * Math.abs(tx.amount)) / 100
					AllowanceCharge.push({ 
						Id: tx.x_studio_codigo_de_descuento,
						ChargeIndicator: (tx.amount > 0 ?true:false),
						AllowanceChargeReason: tx.name,
						MultiplierFactorNumeric: Math.abs(tx.amount),
						Amount: (base_grabable * Math.abs(tx.amount)) / 100,
						BaseAmount: base_grabable
					})

					const it = InvoiceAllowanceCharge.findIndex(it => it.Id == tx.x_studio_codigo_de_descuento && it.AllowanceChargeReason == tx.name && it.MultiplierFactorNumeric == Math.abs(tx.amount))
					if(it == -1) {
						InvoiceAllowanceCharge.push({
							Id: tx.x_studio_codigo_de_descuento,
							ChargeIndicator: (tx.amount > 0 ?true:false),
							AllowanceChargeReason: tx.name,
							MultiplierFactorNumeric: Math.abs(tx.amount),
							Amount: (base_grabable * Math.abs(tx.amount)) / 100,
							BaseAmount: base_grabable
						})
					} else {
						InvoiceAllowanceCharge[it].BaseAmount += base_grabable
						InvoiceAllowanceCharge[it].Amount += (base_grabable * Math.abs(tx.amount)) / 100
					}
					if(tx.amount < 0)
						AllowanceTotalAmount += (base_grabable * Math.abs(tx.amount)) / 100
					else
						ChargeTotalAmount += (base_grabable * Math.abs(tx.amount)) / 100
				}
			}
		}
		let LineExtensionAmount = items_data[i].price_unit * items_data[i].quantity - LineAllowanceTotal + LineChargeTotal
		totalLineExtensionamount += LineExtensionAmount
		TaxInclusiveAmount  += LineExtensionAmount + LineTotalTaxes
		let ItemReference = items_data[i].product_id[1]
		if(ItemReference.indexOf(']') != -1) {
			ItemReference = ItemReference.substring(0,ItemReference.indexOf(']')+1)
		}
		ItemInformation.push({
				ItemReference: ItemReference,
				Name: items_data[i].name,
				Quatity: items_data[i].quantity,
				Price: items_data[i].price_unit,
				LineAllowanceTotal: LineAllowanceTotal,
				LineChargeTotal: LineChargeTotal,
				LineTotalTaxes: LineTotalTaxes,
				LineExtensionAmount: LineExtensionAmount,
				LineTotal: LineExtensionAmount + LineTotalTaxes,
				MeasureUnitCode: '94', //Codigo de Unidad
				FreeOFChargeIndicator: false,
				AdditionalReference: [],
				AdditionalProperty: [],
				TaxesInformation: TaxesInformation,
				AllowanceCharge: AllowanceCharge
		})
	}
	if(!identType) {
		console.log("Error al calcular parametros. "+invoiceNumber)
		return false
	}
	let json = {
		CustomerInformation: {
			IdentificationType: identType,
			Identification: identification,
			DV: (dv?dv:""),
			RegistrationName: clientName,
			CountryCode: countryCode,
			CountryName: countryName,
			SubdivisionCode: (stateCode&&countryCode=='CO'?stateCode.toString().padStart(2, "0"):""),
			SubdivisionName: (stateName&&countryCode=='CO'?stateName:""),
			CityCode: (cityCode&&countryCode=='CO'?cityCode.toString().padStart(5,'0'):""),
			CityName: (cityName&&countryCode=='CO'?cityName:""),
			AddressLine: address,
			Telephone: phone,
			Email: email,
			TaxLevelCodeListName: (fiscalPosition[0]==2?'49':'48'),
			AdditionalAccountID: (clientType == 'person'?1:2),
			CustomerCode: ""
		},
		InvoiceGeneralInformation: {
			InvoiceAuthorizationNumber: resolutionNumber,
			PreinvoiceNumber: parseInt(invoiceNumber.replace( /^\D+/g, '')),
			InvoiceNumber: parseInt(invoiceNumber.replace( /^\D+/g, '')),
			DaysOff: 30,
			Currency: currency[1],
			ExchangeRate: exchangeRate,
			ExchangeRateDate: "",
			SalesPerson: "",
			Note: (comment?comment:""),
			ExternalGR: true
		},
		Delivery:{
			AddressLine:"",
			CountryCode:"",
			CountryName:"",
			SubdivisionCode:"",
			SubdivisionName:"",
			CityCode:"",
			CityName:"",
			ContactPerson:"",
			DeliveryDate:"",
			DeliveryCompany:""
			},
		AdditionalDocuments: {
			OrderReference: "",
			DespatchDocumentReference:"",
			ReceiptDocumentReference:"",
			AdditionalDocument:[{
				DocumentNumber: payment_metohd_pdf_id,
				DocumentCode: 'AHJ'
			}]
		},
		PaymentSummary: {
			PaymentType: 1,
			PaymentMeans: 1,
			PaymentNote: ""
		},
		ItemInformation: ItemInformation,
		InvoiceTaxTotal: InvoiceTaxTotal,
		InvoiceAllowanceCharge: [],	//InvoiceAllowanceCharge
		InvoiceTotal: {
			lineExtensionamount: totalLineExtensionamount,	//LOS DESCUENTOS SE APLICAN ANTES DE LOS IMPUESTOS???. LO QUE BAJARIA LA BASE GRABABLE.
			TaxExclusiveAmount: totalLineExtensionamount,	//TaxExclusiveAmount		
			TaxInclusiveAmount: TaxInclusiveAmount,
			AllowanceTotalAmount: 0,
			ChargeTotalAmount: 0,
			PrePaidAmount: 0,
			PayableAmount: TaxInclusiveAmount
		}
	}

	return json
}

function getInvoicesLines(invoice_ids,callback) {
	let model = 'account.move.line';
	let filter = [['move_id','in',invoice_ids]];
	let fields = ["move_id","name","product_id", "quantity","price_unit","discount","tax_ids"];
	getOdooData(odoo, model, filter, fields, (pData) => {
	   if(pData.status == true && pData.data.length > 0) {
		callback(pData.data)
	   } else {
		   console.log("No data.")
		   callback(false)
	   }
	});
}

function getTaxesData(taxes_ids,callback) {
	let model = 'account.tax';
	let filter = [['id','in',taxes_ids]];
	let fields = ["name","amount_type","amount","x_studio_codigo_tipo_impuesto_dian","x_studio_codigo_de_descuento","x_studio_tipo_de_descuento","x_studio_tipo"];
	getOdooData(odoo, model, filter, fields, (pData) => {
	   if(pData.status == true && pData.data.length > 0) {
		callback(pData.data)
	   } else {
		   callback(false)
	   }
	});
}

function getCUFE(inv) { 
	let model = 'account.move';
	getDocumentStatus(inv.x_documentid, res_doc => {
		let cufe = ""
		if(!res_doc.data || !res_doc.data.DocumentStatus || res_doc.data.DocumentStatus == 70 || !res_doc.data.CUFE) {
			console.log("Error al obtener estado de factura.",res_doc)
		} else {
			cufe = res_doc.data.CUFE
		}
		setOdooData(odoo, model, [inv.id], {'x_cufe': cufe, 'x_invoice_status': res_doc.data.DocumentStatus}, result => {
			if(result.status == true && cufe) { 
				console.log("CUFE obtenido exitosamente."+inv.name)
				downloadInvoicePDF(inv)
			} else {
				console.log("Error al obtener CUFE de factura: "+inv.name)
			}
		})
	}) 

}

function attachInvoice(inv) { 
	let model = 'account.move';
	uploadInvoicePDF(inv, ress => {
		if(ress == 200) {
			console.log("Factura adjunta correctamente.")
			getDocumentStatus(inv.x_documentid, res_doc => {
				if(!res_doc.data || !res_doc.data.DocumentStatus || res_doc.data.DocumentStatus == 70) {
					console.log("Error al obtener estado de factura#2.",res_doc)
				} else {
					setOdooData(odoo, model, [inv.id], {'x_invoice_status': res_doc.data.DocumentStatus, x_studio_enviada_a_proveedor_fe: true}, result => {
						if(result.status == true) { 
							console.log("Factura electronica completada: "+inv.name)
						} else {
							console.log("Error al actualizar datos de factura en Odoo."+inv.name)
						}
					})
				}
			}) 
		} else {
			console.log("Error al subir PDF de factura."+inv.name)
		}
	})
}

function sendJsonToProvider(json,inv) { 
	let model = 'account.move';
	sendInvoiceToProvider(json,response => {
		if(response.status == 200 && response.data && response.data.DocumentId) {
			let documentId = response.data.DocumentId
			console.log(documentId)
			setOdooData(odoo, model, [inv.id], {'x_documentid': documentId, 'x_studio_json': json}, result => {
				if(result.status == true) { 
					console.log("Factura actualizada correctamente."+inv.name)
				} else {
					console.log("Error al actualizar datos de factura en Odoo."+inv.name)
				}
			})
		} else {
			console.log("Error al enviar factura. "+inv.name)
		} 
	})
}


function executeMainElectrornicInvoice(inv,inv_lines,tax_data,time) {
	setTimeoutPromise(3000*time, '').then((value) => {
		if(inv.x_documentid) {
			if(inv.x_invoice_status == '70') {
				console.log("Existe un error con la factura, favor revisar manualmente."+inv.name)
			} else if(!inv.x_cufe) {
				getCUFE(inv) 
			} else {
				attachInvoice(inv)
			} 
		} else {
			let json = jsonInvoiceData(inv.id,inv.x_studio_client_document_type,inv.x_studio_documento, inv.x_studio_dv, inv.partner_id[1], inv.x_country_code,
				inv.x_studio_nombre_pais,inv.x_studio_codigo_departamento,inv.x_studio_nombre_departamento,inv.x_studio_codigo_ciudad,inv.x_studio_nombre_ciudad,
				inv.x_studio_direccion_cliente,inv.x_studio_telefono_cliente,inv.x_studio_correo_cliente,inv.fiscal_position_id,inv.x_studio_tipo_de_cliente,
				inv.x_studio_numero_de_resolucion, inv.name, inv.invoice_date, inv.currency_id,inv.narration, inv.x_studio_tasa_de_cambio,
				inv_lines,tax_data)
			if(json) {
				sendJsonToProvider(json,inv)
			}
		}
	});
}

function getPendingInvoices() {
  if(!token) {
	  console.log("No token")
	  return
  } 
  let model = 'account.move';
  let filter = [['type','=','out_invoice'],['state', '=', 'posted'],['x_studio_facturacion_electronica','=',true],['x_studio_enviada_a_proveedor_fe','=',false]];
  let fields = ["name","invoice_date", "invoice_date_due","journal_id","x_studio_client_document_type","x_studio_documento","x_studio_dv","partner_id", 
  "x_country_code","x_studio_nombre_pais","x_studio_codigo_departamento","x_studio_nombre_departamento","x_studio_codigo_ciudad","x_studio_nombre_ciudad",
  "x_studio_direccion_cliente","x_studio_telefono_cliente","x_studio_correo_cliente","fiscal_position_id","x_studio_tipo_de_cliente","x_studio_numero_de_resolucion",
  "invoice_date","currency_id","narration","x_studio_tasa_de_cambio","access_token","x_documentid","x_cufe"];
  getOdooData(odoo, model, filter, fields, (pData) => {
	 if(pData.status == true && pData.data.length > 0) {
		const invoices = pData.data
		const invoice_ids = invoices.map(il => il.id);
		getInvoicesLines(invoice_ids, invoice_lines => {
			let taxes = []
			let tx = invoice_lines.map(il => il.tax_ids)
			for(let j = 0; j < tx.length; j++) taxes = taxes.concat(tx[j])
			taxes = [...new Set(taxes)]
			getTaxesData(taxes, tax_data => {
				if(tax_data == false) {
					console.log("Error al obtener informacion de impuestos")
					return false
				}
				const invoices_limit = (invoices.length < 40?invoices.length:40)
				console.log("--------")
				for(let i = 0; i < invoices_limit; i++) {
					const inv =  invoices[i]
					const inv_lines = invoice_lines.filter(il => {return il.move_id[0] == inv.id})
					executeMainElectrornicInvoice(inv,inv_lines,tax_data,i)
				} 
			})
		})
	 } else {
		 console.log("No data.")
	 }
  });
}

function updateInvoicesStatus() {
	if(!token) {
		console.log("No token")
		return
	}
	let model = 'account.move';
	let filter = [['type','=','out_invoice'],['state', '=', 'posted'],['x_studio_facturacion_electronica','=',true],['x_studio_enviada_a_proveedor_fe','=',true],['x_invoice_status','in',(72,74)]];
	let fields = ["name","invoice_date", "invoice_date_due","journal_id","x_studio_client_document_type","x_studio_documento","x_studio_dv","partner_id", 
	"x_country_code","x_studio_nombre_pais","x_studio_codigo_departamento","x_studio_nombre_departamento","x_studio_codigo_ciudad","x_studio_nombre_ciudad",
	"x_studio_direccion_cliente","x_studio_telefono_cliente","x_studio_correo_cliente","fiscal_position_id","x_studio_tipo_de_cliente","x_studio_numero_de_resolucion",
	"invoice_date","currency_id","narration","x_studio_tasa_de_cambio","access_token","x_documentid","x_cufe"];
	getOdooData(odoo, model, filter, fields, (pData) => {
	   if(pData.status == true && pData.data.length > 0) {
		  const invoices = pData.data
		  const invoice_ids = invoices.map(il => il.id);
		  
		  
		  getInvoicesLines(invoice_ids, invoice_lines => {
			  let taxes = []
			  let tx = invoice_lines.map(il => il.tax_ids)
			  for(let j = 0; j < tx.length; j++) taxes = taxes.concat(tx[j])
			  taxes = [...new Set(taxes)]
			  getTaxesData(taxes, tax_data => {
				  if(tax_data == false) {
					  console.log("Error al obtener informacion de impuestos")
					  return false
				  }
				  for(let i = 0; i < invoices.length; i++) {
					  const inv =  invoices[i]
					  const inv_lines = invoice_lines.filter(il => {return il.move_id[0] == inv.id})
					  if(inv.x_documentid) {
						  if(inv.x_invoice_status == '70') {
							  console.log("Existe un error con la factura, favor revisar manualmente."+inv.name)
						  } else if(!inv.x_cufe) {
							  getCUFE(inv) 
						  } else {
							  attachInvoice(inv)
						  } 
					  } else {
						  let json = jsonInvoiceData(inv.id,inv.x_studio_client_document_type,inv.x_studio_documento, inv.x_studio_dv, inv.partner_id[1], inv.x_country_code,
							  inv.x_studio_nombre_pais,inv.x_studio_codigo_departamento,inv.x_studio_nombre_departamento,inv.x_studio_codigo_ciudad,inv.x_studio_nombre_ciudad,
							  inv.x_studio_direccion_cliente,inv.x_studio_telefono_cliente,inv.x_studio_correo_cliente,inv.fiscal_position_id,inv.x_studio_tipo_de_cliente,
							  inv.x_studio_numero_de_resolucion, inv.name, inv.invoice_date, inv.currency_id,inv.narration, inv.x_studio_tasa_de_cambio,
							  inv_lines,tax_data)
						  if(json) {
							  sendJsonToProvider(json,inv)
						  }
					  }
				   }
			  })
		  })
	   } else {
		   console.log("No data.")
	   }
	});
  }


updatePartnerToken(res => {
	uploadPaymentMethodPDF(att => {
		getPendingInvoices()
	})
})

//Update Token
setInterval(()=>{updatePartnerToken((res) => {})}, 3600000)

//Send new invoices 
setInterval(getPendingInvoices, 120000)

//Update status invoices
//setInterval(updateInvoicesStatus, 600000)


